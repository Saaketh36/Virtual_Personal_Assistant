"""
Memory layer for Virtual Personal Assistant.

Memory categories:
  - conversation : chat exchanges (session-scoped)
  - document     : uploaded file content & summaries (session-scoped)
  - long_term    : persistent user preferences (cross-session)

All functions degrade gracefully: if PostgreSQL/Ollama are unavailable they
return safe defaults and never crash the main chat path.
"""

import os
import re

import asyncpg
from dotenv import load_dotenv

from embedding import embed

load_dotenv()

DB_URL = os.getenv("DATABASE_URL")
MEMORY_MAX_CHARS = int(os.getenv("MEMORY_MAX_CHARS", "12000"))
CONTEXT_ITEM_MAX_CHARS = int(os.getenv("CONTEXT_ITEM_MAX_CHARS", "3000"))
_schema_ready = False


# ── Helpers ───────────────────────────────────────────────────────────────────

def _trim(text: str, max_chars: int) -> str:
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rstrip() + "\n[truncated]"


def _memory_available() -> bool:
    return bool(DB_URL)


def _warn(action: str, exc: Exception):
    print(f"[memory] {action} skipped: {type(exc).__name__}: {exc}")


async def _connect():
    if not _memory_available():
        return None
    conn = await asyncpg.connect(DB_URL)
    await _ensure_schema(conn)
    return conn


async def _ensure_schema(conn):
    """Create/migrate the conversations table with memory_type and file_path support."""
    global _schema_ready
    if _schema_ready:
        return

    await conn.execute("CREATE EXTENSION IF NOT EXISTS vector")
    await conn.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    # Create the table if it doesn't exist (fresh installs)
    await conn.execute(
        """
        CREATE TABLE IF NOT EXISTS conversations (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id text NOT NULL,
            role text NOT NULL,
            content text NOT NULL,
            summary text,
            embedding vector NOT NULL,
            source text,
            memory_type text NOT NULL DEFAULT 'conversation',
            file_path text,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )

    # Migration: add memory_type column to existing tables that lack it
    has_col = await conn.fetchval(
        """
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'conversations' AND column_name = 'memory_type'
        )
        """
    )
    if not has_col:
        await conn.execute(
            "ALTER TABLE conversations ADD COLUMN memory_type text NOT NULL DEFAULT 'conversation'"
        )

    # Migration: add file_path column if missing
    has_file_path = await conn.fetchval(
        """
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'conversations' AND column_name = 'file_path'
        )
        """
    )
    if not has_file_path:
        await conn.execute(
            "ALTER TABLE conversations ADD COLUMN file_path text"
        )

    # Indexes for fast lookups
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_conv_session ON conversations(session_id)"
    )
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_conv_memory_type ON conversations(memory_type)"
    )
    await conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_conv_session_type ON conversations(session_id, memory_type)"
    )

    # Check for embedding dimension mismatch and truncate table if mismatched
    try:
        test_emb = await embed("test")
        active_dim = len(test_emb)
        row_count = await conn.fetchval("SELECT COUNT(*) FROM conversations")
        if row_count > 0:
            db_dim = await conn.fetchval(
                "SELECT vector_dims(embedding) FROM conversations LIMIT 1"
            )
            if db_dim is not None and db_dim != active_dim:
                print(
                    f"[memory] Dimension mismatch: DB has {db_dim}, model has {active_dim} dimensions."
                )
                print("[memory] Truncating table conversations to prevent crashes.")
                await conn.execute("TRUNCATE TABLE conversations")
    except Exception as e:
        _warn("schema dimension check", e)

    _schema_ready = True



def _make_vec_str(vec: list[float]) -> str:
    return "[" + ",".join(str(x) for x in vec) + "]"


# ── Session-scoped conversation memory ────────────────────────────────────────

async def get_recent_context(session_id: str, limit: int = 4) -> str:
    """Return the last N conversation exchanges for this session only.
    Excludes document rows and long_term rows."""
    if not _memory_available():
        return ""

    conn = None
    try:
        conn = await _connect()
        if not conn:
            return ""
        rows = await conn.fetch(
            """
            SELECT content
            FROM conversations
            WHERE session_id = $1
              AND memory_type = 'conversation'
              AND summary IS NULL
            ORDER BY created_at DESC
            LIMIT $2
            """,
            session_id,
            limit,
        )

        return "\n---\n".join(
            _trim(row["content"], CONTEXT_ITEM_MAX_CHARS)
            for row in reversed(rows)
        )
    except Exception as exc:
        _warn("recent context lookup", exc)
        return ""
    finally:
        if conn:
            await conn.close()


async def get_relevant_context(
    query: str,
    session_id: str,
    *,
    min_similarity: float = 0.58,
    include_summaries: bool = True,
) -> str:
    """Vector similarity search scoped to conversation memory in this session.
    Excludes document memory (those are retrieved separately)."""
    if not _memory_available():
        return ""

    conn = None
    try:
        vec = await embed(_trim(query, MEMORY_MAX_CHARS))
        vec_str = _make_vec_str(vec)
        conn = await _connect()
        if not conn:
            return ""

        rows = await conn.fetch(
            """
            SELECT content, summary, created_at,
                   1 - (embedding <=> $1::vector) AS sim
            FROM conversations
            WHERE session_id = $2
              AND memory_type = 'conversation'
              AND ($3::boolean OR summary IS NULL)
              AND 1 - (embedding <=> $1::vector) >= $4
            ORDER BY embedding <=> $1::vector
            LIMIT 4
            """,
            vec_str,
            session_id,
            include_summaries,
            min_similarity,
        )

        parts = []
        for row in rows:
            if row["summary"]:
                parts.append(f"[Memory summary] {_trim(row['summary'], CONTEXT_ITEM_MAX_CHARS)}")
            else:
                parts.append(_trim(row["content"], CONTEXT_ITEM_MAX_CHARS))
        return "\n---\n".join(parts)
    except Exception as exc:
        _warn("relevant context lookup", exc)
        return ""
    finally:
        if conn:
            await conn.close()


async def save_conversation(user_msg: str, agent_reply: str, session_id: str):
    """Save a chat exchange. The agent reply is truncated to avoid dumping full
    PDF summaries or email bodies into vector memory where they'd leak."""
    if not _memory_available():
        return

    # Truncate long agent replies (PDF summaries, extracted text) to a short note
    safe_reply = _truncate_for_memory(agent_reply)
    combined = _trim(f"User: {user_msg}\nAgent: {safe_reply}", MEMORY_MAX_CHARS)
    conn = None
    try:
        vec = await embed(combined)
        vec_str = _make_vec_str(vec)
        conn = await _connect()
        if not conn:
            return

        await conn.execute(
            """
            INSERT INTO conversations
                (session_id, role, content, embedding, source, memory_type)
            VALUES ($1, 'exchange', $2, $3::vector, 'chat', 'conversation')
            """,
            session_id,
            combined,
            vec_str,
        )
    except Exception as exc:
        _warn("save conversation", exc)
    finally:
        if conn:
            await conn.close()


def _truncate_for_memory(reply: str, max_len: int = 500) -> str:
    """Prevent full PDF summaries, extracted text, and email bodies from being
    stored as conversation memory (they'd pollute vector search for future queries).
    Keep a short representative snippet instead."""
    if len(reply) <= max_len:
        return reply

    # If it's a PDF summary/extraction, keep just the first line
    markers = [
        "Here is the summary of",
        "Extracted text from",
        "I created a neat PDF",
        "I recreated the PDF",
        "Here is the email I prepared",
        "Download it here:",
    ]
    for marker in markers:
        if marker in reply:
            first_line = reply.split("\n")[0]
            return f"{first_line}\n[Full content available in session context]"

    # Generic truncation for other long responses
    return reply[:max_len].rstrip() + "\n[response truncated for memory]"


async def count_raw_turns(session_id: str) -> int:
    if not _memory_available():
        return 0

    conn = None
    try:
        conn = await _connect()
        if not conn:
            return 0
        return await conn.fetchval(
            """
            SELECT COUNT(*) FROM conversations
            WHERE session_id = $1
              AND memory_type = 'conversation'
              AND summary IS NULL
            """,
            session_id,
        )
    except Exception as exc:
        _warn("raw turn count", exc)
        return 0
    finally:
        if conn:
            await conn.close()


async def summarize_old_turns(session_id: str, summarize_fn):
    if not _memory_available():
        return

    conn = None
    try:
        conn = await _connect()
        if not conn:
            return
        rows = await conn.fetch(
            """
            SELECT id, content FROM conversations
            WHERE session_id = $1
              AND memory_type = 'conversation'
              AND summary IS NULL
            ORDER BY created_at ASC
            LIMIT 5
            """,
            session_id,
        )

        if not rows:
            return

        combined = _trim("\n".join(row["content"] for row in rows), MEMORY_MAX_CHARS)
        summary_text = _trim(await summarize_fn(combined), CONTEXT_ITEM_MAX_CHARS)
        summary_vec = await embed(summary_text)
        vec_str = _make_vec_str(summary_vec)

        ids = [row["id"] for row in rows]
        await conn.execute(
            "DELETE FROM conversations WHERE id = ANY($1::uuid[])",
            ids,
        )
        await conn.execute(
            """
            INSERT INTO conversations
                (session_id, role, content, summary, embedding, source, memory_type)
            VALUES ($1, 'summary', $2, $3, $4::vector, 'chat', 'conversation')
            """,
            session_id,
            combined[:500],
            summary_text,
            vec_str,
        )
    except Exception as exc:
        _warn("summarize old turns", exc)
    finally:
        if conn:
            await conn.close()


# ── Session-scoped document memory ────────────────────────────────────────────

async def save_document_memory(
    session_id: str,
    document_text: str,
    filename: str | None = None,
    summary: str | None = None,
    file_path: str | None = None,
):
    """Store extracted document content into the DB, strictly scoped to this session.
    The document is tagged with memory_type='document' and records the local file_path."""
    if not _memory_available():
        return

    label = filename or "uploaded document"
    content = _trim(f"[Document: {label}]\n{document_text}", MEMORY_MAX_CHARS)
    conn = None
    try:
        vec = await embed(content[:4000])
        vec_str = _make_vec_str(vec)
        conn = await _connect()
        if not conn:
            return

        summary_text = _trim(summary, CONTEXT_ITEM_MAX_CHARS) if summary else None
        await conn.execute(
            """
            INSERT INTO conversations
                (session_id, role, content, summary, embedding, source, memory_type, file_path)
            VALUES ($1, 'document', $2, $3, $4::vector, $5, 'document', $6)
            """,
            session_id,
            content,
            summary_text,
            vec_str,
            filename or "pdf_upload",
            file_path,
        )
    except Exception as exc:
        _warn("save document memory", exc)
    finally:
        if conn:
            await conn.close()


async def get_session_documents(session_id: str, filename: str | None = None) -> str:
    """Return document content uploaded in THIS session only.
    If filename is specified, filters strictly for that document.
    Otherwise, returns the single most recently uploaded document."""
    if not _memory_available():
        return ""

    conn = None
    try:
        conn = await _connect()
        if not conn:
            return ""
        
        if filename:
            rows = await conn.fetch(
                """
                SELECT content, summary
                FROM conversations
                WHERE session_id = $1 
                  AND memory_type = 'document'
                  AND source = $2
                ORDER BY created_at DESC
                LIMIT 1
                """,
                session_id,
                filename,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT content, summary
                FROM conversations
                WHERE session_id = $1 AND memory_type = 'document'
                ORDER BY created_at DESC
                LIMIT 1
                """,
                session_id,
            )
        parts = []
        for row in rows:
            if row["summary"]:
                parts.append(f"[Document summary] {_trim(row['summary'], CONTEXT_ITEM_MAX_CHARS)}")
            else:
                parts.append(_trim(row["content"], CONTEXT_ITEM_MAX_CHARS))
        return "\n---\n".join(parts)
    except Exception as exc:
        _warn("get session documents", exc)
        return ""
    finally:
        if conn:
            await conn.close()


async def get_latest_session_document(session_id: str) -> dict | None:
    """Retrieve the path and filename of the most recently uploaded document in this session."""
    if not _memory_available():
        return None

    conn = None
    try:
        conn = await _connect()
        if not conn:
            return None
        row = await conn.fetchrow(
            """
            SELECT file_path, source
            FROM conversations
            WHERE session_id = $1 AND memory_type = 'document'
            ORDER BY created_at DESC
            LIMIT 1
            """,
            session_id,
        )
        if row and row["file_path"]:
            return {
                "path": row["file_path"],
                "filename": row["source"]
            }
        return None
    except Exception as exc:
        _warn("get latest session document", exc)
        return None
    finally:
        if conn:
            await conn.close()


async def get_session_uploaded_documents(session_id: str) -> list[dict]:
    """Retrieve path and filename of all documents uploaded in this session, ordered oldest first."""
    if not _memory_available():
        return []

    conn = None
    try:
        conn = await _connect()
        if not conn:
            return []
        rows = await conn.fetch(
            """
            SELECT file_path, source
            FROM conversations
            WHERE session_id = $1 AND memory_type = 'document'
            ORDER BY created_at ASC
            """,
            session_id,
        )
        seen = set()
        results = []
        for row in rows:
            if row["file_path"] and row["file_path"] not in seen:
                seen.add(row["file_path"])
                results.append({
                    "path": row["file_path"],
                    "filename": row["source"]
                })
        return results
    except Exception as exc:
        _warn("get session uploaded documents", exc)
        return []
    finally:
        if conn:
            await conn.close()


# ── Long-term memory (cross-session) ─────────────────────────────────────────

async def get_long_term_memory(query: str, min_similarity: float = 0.6) -> str:
    """Search persistent user preferences/facts across all sessions."""
    if not _memory_available():
        return ""

    conn = None
    try:
        vec = await embed(_trim(query, MEMORY_MAX_CHARS))
        vec_str = _make_vec_str(vec)
        conn = await _connect()
        if not conn:
            return ""

        rows = await conn.fetch(
            """
            SELECT content, 1 - (embedding <=> $1::vector) AS sim
            FROM conversations
            WHERE memory_type = 'long_term'
              AND 1 - (embedding <=> $1::vector) >= $2
            ORDER BY embedding <=> $1::vector
            LIMIT 3
            """,
            vec_str,
            min_similarity,
        )
        return "\n".join(_trim(row["content"], CONTEXT_ITEM_MAX_CHARS) for row in rows)
    except Exception as exc:
        _warn("long-term memory lookup", exc)
        return ""
    finally:
        if conn:
            await conn.close()


async def save_long_term_fact(fact: str):
    """Store a persistent user preference or fact (not session-scoped)."""
    if not _memory_available():
        return

    conn = None
    try:
        vec = await embed(fact)
        vec_str = _make_vec_str(vec)
        conn = await _connect()
        if not conn:
            return
        await conn.execute(
            """
            INSERT INTO conversations
                (session_id, role, content, embedding, source, memory_type)
            VALUES ('__global__', 'fact', $1, $2::vector, 'long_term', 'long_term')
            """,
            fact,
            vec_str,
        )
    except Exception as exc:
        _warn("save long-term fact", exc)
    finally:
        if conn:
            await conn.close()


# ── Session management (REST API support) ────────────────────────────────────

async def list_sessions() -> list[dict]:
    """Return all distinct sessions with a preview of the first message and
    the most recent timestamp, ordered newest first."""
    if not _memory_available():
        return []

    conn = None
    try:
        conn = await _connect()
        if not conn:
            return []
        rows = await conn.fetch(
            """
            SELECT
                session_id,
                MIN(created_at) AS started_at,
                MAX(created_at) AS last_active,
                (SELECT c2.content
                 FROM conversations c2
                 WHERE c2.session_id = c.session_id
                   AND c2.memory_type = 'conversation'
                   AND c2.summary IS NULL
                 ORDER BY c2.created_at ASC
                 LIMIT 1) AS first_content
            FROM conversations c
            WHERE c.session_id != '__global__'
            GROUP BY session_id
            ORDER BY MAX(created_at) DESC
            """
        )
        results = []
        for row in rows:
            preview = (row["first_content"] or "")[:60].replace("\n", " ").strip()
            if preview.startswith("User: "):
                preview = preview[6:]
            results.append({
                "id": row["session_id"],
                "name": preview or "Conversation",
                "started_at": row["started_at"].isoformat() if row["started_at"] else None,
                "last_active": row["last_active"].isoformat() if row["last_active"] else None,
            })
        return results
    except Exception as exc:
        _warn("list sessions", exc)
        return []
    finally:
        if conn:
            await conn.close()


async def get_session_messages(session_id: str) -> list[dict]:
    """Return the ordered chat history for a session.
    Each row is split into user/agent turns where possible."""
    if not _memory_available():
        return []

    conn = None
    try:
        conn = await _connect()
        if not conn:
            return []
        rows = await conn.fetch(
            """
            SELECT content, role, source, summary, created_at, memory_type
            FROM conversations
            WHERE session_id = $1
            ORDER BY created_at ASC
            """,
            session_id,
        )
        messages = []
        for row in rows:
            content = row["content"] or ""
            created = row["created_at"].isoformat() if row["created_at"] else None
            source = row["source"] or "chat"

            if row["role"] == "summary":
                messages.append({
                    "role": "system",
                    "content": f"[Summary of earlier conversation]\n{row['summary'] or content}",
                    "time": created,
                    "source": source,
                })
            elif row["memory_type"] == "document":
                messages.append({
                    "role": "system",
                    "content": "[Uploaded document stored in memory]",
                    "time": created,
                    "source": source,
                })
            elif content.startswith("User: ") and "\nAgent: " in content:
                parts = content.split("\nAgent: ", 1)
                user_part = parts[0].removeprefix("User: ").strip()
                agent_part = parts[1].strip() if len(parts) > 1 else ""
                messages.append({"role": "user", "content": user_part, "time": created, "source": source})
                if agent_part:
                    messages.append({"role": "agent", "content": agent_part, "time": created, "source": source})
            else:
                messages.append({"role": "user", "content": content, "time": created, "source": source})

        return messages
    except Exception as exc:
        _warn("get session messages", exc)
        return []
    finally:
        if conn:
            await conn.close()


async def delete_session(session_id: str) -> bool:
    """Delete all conversation rows for a given session. Returns True on success."""
    if not _memory_available():
        return False

    conn = None
    try:
        conn = await _connect()
        if not conn:
            return False
        await conn.execute(
            "DELETE FROM conversations WHERE session_id = $1",
            session_id,
        )
        return True
    except Exception as exc:
        _warn("delete session", exc)
        return False
    finally:
        if conn:
            await conn.close()
