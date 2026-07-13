import asyncpg
import os
from embedding import embed
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.getenv("DATABASE_URL")


async def get_relevant_context(
    query: str,
    session_id: str,
    *,
    min_similarity: float = 0.58,
    include_summaries: bool = True,
) -> str:
    vec = await embed(query)
    vec_str = "[" + ",".join(str(x) for x in vec) + "]"

    conn = await asyncpg.connect(DB_URL)
    try:
        rows = await conn.fetch("""
            SELECT content, summary, created_at,
                   1 - (embedding <=> $1::vector) AS sim
            FROM conversations
            WHERE session_id = $2
              AND ($3::boolean OR summary IS NULL)
              AND 1 - (embedding <=> $1::vector) >= $4
            ORDER BY embedding <=> $1::vector
            LIMIT 4
        """, vec_str, session_id, include_summaries, min_similarity)

        if not rows:
            return ""

        parts = []
        for r in rows:
            if r["summary"]:
                parts.append(f"[Memory summary] {r['summary']}")
            else:
                parts.append(r["content"])
        return "\n---\n".join(parts)
    finally:
        await conn.close()


async def get_recent_context(session_id: str, limit: int = 4) -> str:
    conn = await asyncpg.connect(DB_URL)
    try:
        rows = await conn.fetch("""
            SELECT content
            FROM conversations
            WHERE session_id = $1 AND summary IS NULL
            ORDER BY created_at DESC
            LIMIT $2
        """, session_id, limit)

        if not rows:
            return ""

        return "\n---\n".join(r["content"] for r in reversed(rows))
    finally:
        await conn.close()


async def save_conversation(user_msg: str, agent_reply: str, session_id: str):
    combined = f"User: {user_msg}\nAgent: {agent_reply}"
    vec = await embed(combined)
    vec_str = "[" + ",".join(str(x) for x in vec) + "]"

    conn = await asyncpg.connect(DB_URL)
    try:
        await conn.execute("""
            INSERT INTO conversations
                (session_id, role, content, embedding, source)
            VALUES ($1, 'exchange', $2, $3::vector, 'chat')
        """, session_id, combined, vec_str)
    finally:
        await conn.close()


async def count_raw_turns(session_id: str) -> int:
    conn = await asyncpg.connect(DB_URL)
    try:
        return await conn.fetchval("""
            SELECT COUNT(*) FROM conversations
            WHERE session_id = $1 AND summary IS NULL
        """, session_id)
    finally:
        await conn.close()


async def summarize_old_turns(session_id: str, summarize_fn):
    conn = await asyncpg.connect(DB_URL)
    try:
        rows = await conn.fetch("""
            SELECT id, content FROM conversations
            WHERE session_id = $1 AND summary IS NULL
            ORDER BY created_at ASC
            LIMIT 5
        """, session_id)

        if not rows:
            return

        combined = "\n".join(r["content"] for r in rows)
        summary_text = await summarize_fn(combined)
        summary_vec = await embed(summary_text)
        vec_str = "[" + ",".join(str(x) for x in summary_vec) + "]"

        ids = [r["id"] for r in rows]
        await conn.execute(
            "DELETE FROM conversations WHERE id = ANY($1::uuid[])", ids
        )
        await conn.execute("""
            INSERT INTO conversations
                (session_id, role, content, summary, embedding, source)
            VALUES ($1, 'summary', $2, $3, $4::vector, 'chat')
        """, session_id, combined[:500], summary_text, vec_str)
    finally:
        await conn.close()