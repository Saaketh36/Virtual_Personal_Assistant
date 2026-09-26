import os
import re
import json
import mimetypes
from dotenv import load_dotenv
from agno.agent import Agent
from agno.models.groq import Groq
from tools.web_search import search_web
from tools.email_tool import (
    draft_email,
    email_last_action,
    read_inbox,
    reply_to_email,
    search_emails,
    send_email,
    clean_email_body_plain,
)
from tools.pdf_tool import (
    create_topic_pdf,
    extract_pdf_text,
    modify_pdf_section,
    find_replace_in_pdf,
    PDF_STORAGE_DIR,
    PDF_OUTPUT_DIR,
)
from memory import (
    get_relevant_context,
    get_recent_context,
    save_conversation,
    count_raw_turns,
    summarize_old_turns,
    save_document_memory,
    get_session_documents,
    get_relevant_document_context,
    get_latest_session_document,
    get_long_term_memory,
    get_session_uploaded_documents,
)

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
GROQ_CODE_MODEL = os.getenv("GROQ_CODE_MODEL", "qwen/qwen3.8-27b")

# Primary model — general reasoning and chat
llama_model = Groq(id=GROQ_MODEL, api_key=GROQ_API_KEY)

# Secondary model — coding / multilingual tasks
qwen_model = Groq(id=GROQ_CODE_MODEL, api_key=GROQ_API_KEY)

CODE_KEYWORDS = ["code", "script", "python", "function", "debug", "error", "class ", "fix this", "write a program"]

SEARCH_KEYWORDS = [
    "latest", "current", "today", "news", "weather", "price", "stock",
    "who", "what", "where", "when", "why", "how", "won", "winner", "score",
    "president", "prime minister", "population", "temperature", "forecast",
    "recent", "now", "2026", "search", "game", "match", "vs", "versus"
]

EMAIL_KEYWORDS = [
    "send email", "send an email", "email to", "mail to", "write an email",
    "write a mail", "write mail", "compose email", "draft email", "draft an email",
    "read email", "check email", "check my email", "open email",
    "inbox", "unread", "my emails", "new emails",
    "reply to", "reply to email", "respond to email",
    "search email", "find email", "emails from", "email from",
    "forward email",
]

PDF_KEYWORDS = [
    "pdf", "document", "extract text", "summarize pdf", "summarise pdf",
    "modify pdf", "update section", "replace section", "change section",
]

# Regex for "make/create/generate/write [any words] pdf" — catches adjectives
_PDF_CREATE_RE = re.compile(
    r"\b(make|create|generate|write|build|produce)\b.{0,40}\bpdf\b"
)

PDF_FOLLOWUP_KEYWORDS = [
    "change", "replace", "update", "modify", "edit",
    "from", "set the", "fix the", "correct the",
    "paragraph", "paragraphs", "para", "para wise", "paragraph wise",
    "point wise", "points wise", "bullet", "bullets", "prose",
    "more information", "more info", "add more", "more detail",
    "more details", "expand", "elaborate", "enrich", "detailed",
    "not enough", "too short", "longer", "in depth",
]

PDF_STYLE_KEYWORDS = [
    "paragraph", "paragraphs", "para", "para wise", "paragraph wise",
    "point wise", "points wise", "bullet", "bullets", "prose",
]

EMAIL_ADDRESS_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
EMAIL_CONTINUATION_WORDS = (
    "asking", "ask", "saying", "say", "subject", "body", "message", "content",
    "had", "have", "having", "about", "regarding", "for", "with", "cc", "bcc",
)
COMMON_EMAIL_TLDS = (
    "co.in", "co.uk", "com.au", "com", "net", "org", "edu", "gov", "io", "ai",
    "dev", "in", "co", "uk",
)
PENDING_EMAILS: dict[str, list[dict]] = {}
SESSION_PDFS: dict[str, list[dict]] = {}


def _remember_pdf(session_id: str, entry: dict):
    if session_id not in SESSION_PDFS or not isinstance(SESSION_PDFS[session_id], list):
        SESSION_PDFS[session_id] = []
    SESSION_PDFS[session_id] = [
        p for p in SESSION_PDFS[session_id]
        if isinstance(p, dict) and p.get("path") != entry.get("path")
    ]
    SESSION_PDFS[session_id].append(entry)


def _get_latest_pdf(session_id: str) -> dict | None:
    val = SESSION_PDFS.get(session_id)
    if isinstance(val, list) and val:
        return val[-1]
    if isinstance(val, dict):
        return val
    return None

APPROVAL_KEYWORDS = {
    "yes", "yes send", "send", "send it", "send email", "send this",
    "yes send it", "looks good", "ok", "okay", "approved", "approve", "go ahead",
}
REJECTION_KEYWORDS = {
    "no", "cancel", "discard", "don't send", "dont send", "do not send", "stop",
}


def pick_model(user_text: str):
    text = user_text.lower()
    if any(k in text for k in CODE_KEYWORDS):
        return qwen_model
    return llama_model


def needs_email(user_text: str) -> bool:
    text = user_text.lower()
    return any(k in text for k in EMAIL_KEYWORDS)


def needs_pdf(user_text: str, pdf_path: str | None = None, session_id: str | None = None) -> bool:
    text = user_text.lower()
    explicit_pdf_actions = [
        "summarize", "summarise", "summary", "extract", "text from",
        "read this pdf", "read the pdf", "modify", "update section",
        "replace section", "change section",
    ]
    if bool(pdf_path) and any(k in text for k in explicit_pdf_actions):
        return True
    if bool(_PDF_CREATE_RE.search(text)):
        return True
    if any(k in text for k in PDF_KEYWORDS) and any(k in text for k in explicit_pdf_actions):
        return True
    if session_id and bool(SESSION_PDFS.get(session_id)):
        if any(k in text for k in PDF_FOLLOWUP_KEYWORDS):
            return True
    return False


def is_vague_followup(user_text: str) -> bool:
    text = user_text.strip().lower()
    followup_markers = [
        "it", "its", "this", "that", "same", "again", "instead", "previous",
        "above", "last", "dont", "don't", "make it", "give me", "these", "those",
    ]
    # Check for word-bounded pronoun references (e.g. "its", "it", "this")
    return any(re.search(rf"\b{re.escape(m)}\b", text) for m in followup_markers)


def is_pdf_style_followup(user_text: str, session_id: str) -> bool:
    text = user_text.lower()
    return session_id in SESSION_PDFS and any(k in text for k in PDF_STYLE_KEYWORDS)


def is_email_write_request(user_text: str) -> bool:
    text = user_text.lower()
    write_keywords = [
        "send email", "send an email", "send the email", "send this email",
        "send mail", "send a mail", "send the mail", "send this mail",
        "email to", "mail to", "mail it to", "email it to",
        "write a mail", "write mail", "write an email", "write email",
        "reply to", "reply to email", "respond to email",
        "draft email", "draft an email", "draft a mail", "draft mail",
        "compose email", "compose a mail", "compose mail",
    ]
    if any(k in text for k in write_keywords):
        return True
    if "@" in text and any(w in text for w in ["mail", "email", "send", "attach"]):
        return True
    if ("attach" in text or "send this file" in text or "send this pdf" in text) and ("mail" in text or "email" in text):
        return True
    return False


def _normalize_email_text(text: str) -> str:
    normalized = re.sub(r"\s+at\s+", "@", text, flags=re.IGNORECASE)
    normalized = re.sub(r"\s+dot\s+", ".", normalized, flags=re.IGNORECASE)
    return normalized


def _split_email_candidate(candidate: str) -> tuple[str, str]:
    if "@" not in candidate:
        return candidate, ""

    local, domain = candidate.split("@", 1)
    domain_lower = domain.lower()
    for tld in COMMON_EMAIL_TLDS:
        marker = f".{tld}"
        idx = domain_lower.find(marker)
        if idx == -1:
            continue

        end = idx + len(marker)
        suffix = domain[end:]
        if not suffix or suffix.lower().startswith(EMAIL_CONTINUATION_WORDS):
            return f"{local}@{domain[:end]}", suffix

    return candidate, ""


def _extract_email_matches(text: str) -> list[dict]:
    matches = []
    for match in EMAIL_ADDRESS_RE.finditer(text):
        email, suffix = _split_email_candidate(match.group(0))
        end = match.start() + len(email)
        matches.append({
            "email": email,
            "start": match.start(),
            "end": end,
            "suffix": suffix,
        })
    return matches


def _extract_labeled_value(text: str, labels: list[str], stop_labels: list[str]) -> str:
    label_pattern = "|".join(rf"\b{re.escape(label)}\b" for label in labels)
    stop_pattern = "|".join(rf"\b{re.escape(label)}\b" for label in stop_labels)
    match = re.search(
        rf"(?:{label_pattern})\s*[:\-]?\s*(.+?)(?=\s+(?:{stop_pattern})\s*[:\-]?|$)",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    value = match.group(1).strip(" .\n\t\"'") if match else ""
    return "" if value.lower() in {"it", "with it"} else value


def is_approval(text: str) -> bool:
    normalized = re.sub(r"[^\w\s]", "", text.strip().lower())
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized in APPROVAL_KEYWORDS


def is_rejection(text: str) -> bool:
    normalized = re.sub(r"[^\w\s]", "", text.strip().lower())
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized in REJECTION_KEYWORDS


def find_referred_pdf(user_text: str, pdf_list: list[dict]) -> dict | None:
    """Select the correct PDF from the uploaded PDF list based on user reference or topic keywords."""
    if not pdf_list:
        return None

    text = user_text.lower().strip()

    # Keyword / topic matching first
    for item in reversed(pdf_list):
        fname = (item.get("filename") or "").lower()
        topic = (item.get("topic") or "").lower()
        for kw in ["resume", "cv", "outing", "deep learning", "report", "paper", "essay"]:
            if kw in text and (kw in fname or kw in topic):
                return item

    # Positional references
    if "previous previous" in text or "second to last" in text or "before the last" in text or "second-to-last" in text:
        if len(pdf_list) >= 3:
            return pdf_list[-3]
        if len(pdf_list) >= 2:
            return pdf_list[-2]
        return pdf_list[0]

    if "previous" in text or "before" in text:
        if len(pdf_list) >= 2:
            return pdf_list[-2]
        return pdf_list[0]

    return pdf_list[-1]


def find_referred_email(user_text: str, email_list: list[dict]) -> tuple[dict | None, int]:
    """Select the correct email from the pending drafts list based on user reference."""
    if not email_list:
        return None, -1

    text = user_text.lower().strip()

    # 1. "first" / "1st"
    if "first" in text or "1st" in text:
        return email_list[0], 0

    # 2. "before that one" / "previous" / "second to last" / "second-to-last"
    if "before that" in text or "previous" in text or "second to last" in text or "second-to-last" in text:
        if len(email_list) >= 2:
            return email_list[-2], len(email_list) - 2
        return email_list[0], 0

    # 3. "second" / "2nd"
    if "second" in text or "2nd" in text:
        if len(email_list) >= 2:
            return email_list[1], 1

    # 4. Default approval keywords or "last"
    if is_approval(user_text) or any(k in text for k in ["send it", "send this", "go ahead", "mail it", "last"]):
        return email_list[-1], len(email_list) - 1

    # Generic "send email" command
    if "send" in text and ("email" in text or "mail" in text):
        return email_list[-1], len(email_list) - 1

    return None, -1


def analyze_requested_detail(user_text: str, context: str = "") -> dict:
    """
    Intelligently evaluate the user's requested level of detail, depth, and scope.
    Applies globally across all agent capabilities and tasks.
    """
    text = user_text.lower()

    # 1. Concise / Short patterns
    concise_patterns = [
        r"\b(?:in\s+)?simple\s+terms\b",
        r"\b(?:in\s+)?simple\s+words\b",
        r"\b(?:in\s+)?simple\s+language\b",
        r"\b(?:keep\s+it\s+)?simple\b",
        r"\bsimply\s+explain\b",
        r"\bexplain\s+simply\b",
        r"\bbrief\b",
        r"\bbriefly\b",
        r"\bin\s+brief\b",
        r"\bshort\b",
        r"\bshortly\b",
        r"\bin\s+short\b",
        r"\bquick\b",
        r"\bquickly\b",
        r"\bconcise\b",
        r"\bconcisely\b",
        r"\btldr\b",
        r"\btl;dr\b",
        r"\bin\s+a\s+nutshell\b",
        r"\bin\s+(?:one|1)\s+sentence\b",
        r"\bin\s+(?:one|1)\s+paragraph\b",
        r"\bhigh\s*level\b",
        r"\b2-3\s+lines?\b",
        r"\bfew\s+words\b",
        r"\bjust\s+the\s+answer\b",
        r"\bquick\s+overview\b",
    ]
    wants_concise = any(re.search(p, text) for p in concise_patterns)

    # 2. Detailed / In-Depth / Comprehensive patterns
    detailed_patterns = [
        r"\bin\s+detail\b",
        r"\bdetailed\b",
        r"\bcomprehensiv(?:e|ely)\b",
        r"\bdeep\s*dive\b",
        r"\bin[\s-]depth\b",
        r"\bstep[\s-]by[\s-]step\b",
        r"\bthorough(?:ly)?\b",
        r"\bextensive(?:ly)?\b",
        r"\bcomplete\s+guide\b",
        r"\bcomplete\s+breakdown\b",
        r"\bfrom\s+basics\b",
        r"\bfrom\s+scratch\b",
        r"\bfrom\s+the\s+ground\s+up\b",
        r"\bexplain\s+everything\b",
        r"\bwalk\s+me\s+through\b",
        r"\belaborate\b",
        r"\bfull\s+explanation\b",
        r"\ball\s+aspects\b",
    ]
    wants_detailed = any(re.search(p, text) for p in detailed_patterns)

    aspect_keywords = [
        "basics", "architecture", "workflow", "components", "pipeline", "mechanisms",
        "embeddings", "vector databases", "retrieval", "generation", "example",
        "pros and cons", "trade-offs", "advantages", "disadvantages", "implementation",
        "best practices"
    ]
    matched_aspects = [k for k in aspect_keywords if k in text]

    if len(matched_aspects) >= 3:
        wants_detailed = True

    if wants_concise and wants_detailed:
        wants_concise = False
        wants_detailed = False

    has_large_user_input = len(user_text.strip().split()) > 75 or len(user_text.strip()) > 500
    has_large_context = len(context.strip()) > 1500

    if wants_concise:
        mode = "concise"
        guidance = (
            "THE USER REQUESTS A CONCISE / SIMPLE RESPONSE:\n"
            "- Deliver a focused, direct, and straightforward answer without unnecessary jargon, fluff, or excessive preambles.\n"
            "- Explain the core concepts clearly in plain terms in 1 to 2 crisp paragraphs or a few tight bullet points.\n"
            "- Do NOT artificially inflate the response with unwanted history, unprompted tangents, or excessive boilerplate."
        )
    elif wants_detailed:
        mode = "detailed"
        specifics = f" (explicitly covering: {', '.join(matched_aspects)})" if matched_aspects else ""
        guidance = (
            f"THE USER REQUESTS A COMPREHENSIVE, IN-DEPTH RESPONSE{specifics}:\n"
            "- Provide an extensive, deep, and well-structured answer covering EVERY requested aspect, component, workflow, and example in detail.\n"
            "- Organize with clear Markdown section headings (e.g. ### 1. Basics, ### 2. Architecture & Workflow, etc.).\n"
            "- Provide thorough explanations, concrete real-world examples, and architectural clarity.\n"
            "- Do NOT cut corners, over-abbreviate, or leave out requested components."
        )
    elif has_large_user_input or has_large_context:
        mode = "context_rich"
        guidance = (
            "THE REQUEST CONTAINS SUBSTANTIAL CONTEXT AND SPECIFIC REQUIREMENTS:\n"
            "- Thoroughly review and preserve all key facts, constraints, and instructions provided in the context.\n"
            "- Do not unnecessarily discard or summarize away crucial specific requirements or data points."
        )
    else:
        mode = "balanced"
        guidance = (
            "NATURAL ADAPTIVE SCOPE:\n"
            "- The user provided a standard query. Provide a direct, balanced, and complete response that matches the question's natural scope—informative without being bloated, and concise without omitting necessary substance."
        )

    return {
        "mode": mode,
        "guidance": guidance,
        "wants_concise": wants_concise,
        "wants_detailed": wants_detailed,
    }


ATTACHMENT_KEYWORDS_RE = re.compile(
    r"\b(?:attach|attaching|attached|attachment|with\s+(?:the\s+)?attachment|send\s+(?:this\s+)?(?:file|pdf|document))\b",
    re.IGNORECASE
)


def detect_attachment_intent(user_text: str) -> tuple[bool, str]:
    """
    Distinguish between explicitly wanting to ATTACH a file vs merely MENTIONING it.
    Returns (wants_attachment, file_hint).
    """
    text = user_text.lower()
    has_attach = bool(ATTACHMENT_KEYWORDS_RE.search(text))

    file_hint = ""
    for kw in ["resume", "cv", "pdf", "document", "file", "report", "paper", "presentation", "sheet"]:
        if kw in text:
            file_hint = kw
            break

    fn_match = re.search(r"\b([A-Za-z0-9_.-]+\.(?:pdf|txt|docx|csv|json))\b", text)
    if fn_match:
        file_hint = fn_match.group(1)

    return has_attach, file_hint


def resolve_session_attachment(
    session_id: str,
    file_hint: str = "",
    current_pdf_path: str | None = None,
    current_pdf_filename: str | None = None,
    db_docs: list[dict] | None = None,
) -> tuple[dict | None, str | None]:
    """
    Resolve the actual binary file from current turn upload, session PDF history, or database.
    Verifies that the file exists on disk and is non-empty.
    Returns (attachment_dict, error_message).
    """
    candidates = []

    # 1. Current request PDF upload
    if current_pdf_path and os.path.isfile(current_pdf_path) and os.path.getsize(current_pdf_path) > 0:
        candidates.append({
            "path": current_pdf_path,
            "filename": current_pdf_filename or os.path.basename(current_pdf_path),
        })

    # 2. Session PDF history in memory (newest first)
    session_list = SESSION_PDFS.get(session_id, [])
    if isinstance(session_list, list):
        for item in reversed(session_list):
            if isinstance(item, dict) and item.get("path") and os.path.isfile(item["path"]) and os.path.getsize(item["path"]) > 0:
                if not any(c["path"] == item["path"] for c in candidates):
                    candidates.append(item)

    # 3. DB document records for this session
    if db_docs and isinstance(db_docs, list):
        for item in reversed(db_docs):
            if isinstance(item, dict) and item.get("path") and os.path.isfile(item["path"]) and os.path.getsize(item["path"]) > 0:
                if not any(c["path"] == item["path"] for c in candidates):
                    candidates.append(item)

    session_candidates = list(candidates)

    fallback_candidates = []
    for storage_dir in [PDF_STORAGE_DIR, PDF_OUTPUT_DIR]:
        if storage_dir.exists():
            files = sorted(storage_dir.glob("*.pdf"), key=os.path.getmtime, reverse=True)
            for f in files:
                if f.is_file() and f.stat().st_size > 0:
                    fallback_candidates.append({
                        "path": str(f),
                        "filename": f.name,
                    })

    hint = file_hint.lower().strip()
    is_generic_hint = not hint or hint in {"file", "pdf", "document", "this", "it", "my"}
    selected = None

    if not is_generic_hint:
        # Match specific hint in session candidates first
        for cand in session_candidates:
            fname = cand.get("filename", "").lower()
            fpath = cand.get("path", "").lower()
            topic = cand.get("topic", "").lower()
            if hint in fname or hint in fpath or hint in topic:
                selected = cand
                break

        # Fallback to disk storage only if candidate strictly matches user's specific hint
        if not selected:
            for cand in fallback_candidates:
                fname = cand.get("filename", "").lower()
                fpath = cand.get("path", "").lower()
                topic = cand.get("topic", "").lower()
                if hint in fname or hint in fpath or hint in topic:
                    selected = cand
                    break
    else:
        # For generic hints ("this file", "this pdf"), only take the active session document
        if session_candidates:
            selected = session_candidates[0]

    if not selected:
        target_name = file_hint if file_hint and file_hint not in {"file", "pdf", "document", "this", "it", "my"} else "requested file"
        return None, (
            f"I noticed you asked to attach your {target_name}, but I could not find or access that file in this session. "
            "Please upload your file using the attachment button (paperclip) in the chat, and I will attach it to your email."
        )

    try:
        with open(selected["path"], "rb") as f:
            content = f.read()

        raw_filename = selected.get("filename") or os.path.basename(selected["path"])
        clean_name = re.sub(r"^[a-f0-9]{32}_", "", raw_filename)
        ctype, _ = mimetypes.guess_type(clean_name)
        if not ctype:
            ctype = "application/pdf" if clean_name.lower().endswith(".pdf") else "application/octet-stream"

        return {
            "filename": clean_name,
            "path": selected["path"],
            "content": content,
            "content_type": ctype,
            "size": len(content),
        }, None
    except Exception as exc:
        return None, f"Could not read attachment file: {exc}"


def parse_direct_email_request(
    user_text: str,
    session_id: str = "",
    current_pdf_path: str | None = None,
    current_pdf_filename: str | None = None,
    db_docs: list[dict] | None = None,
) -> dict | None:
    """Parse straightforward send/draft commands without relying on tool calling."""
    text = _normalize_email_text(user_text.strip())
    lowered = text.lower()
    if not is_email_write_request(text):
        return None
    if any(k in lowered for k in ["reply to", "reply to email", "respond to email"]):
        return None

    email_matches = _extract_email_matches(text)
    if not email_matches:
        return {
            "error": "I need the recipient's email address before I can send it.",
        }

    to_email = email_matches[0]["email"]
    cc_email = None
    bcc_email = None

    # Check for CC/BCC patterns in the text
    cc_match = re.search(r"cc\s*[:\-]?\s*([\w.+-]+@[\w-]+(?:\.[\w-]+)+)", lowered)
    if cc_match:
        cc_email = _split_email_candidate(cc_match.group(1))[0]
    elif len(email_matches) > 1:
        for email_match in email_matches[1:]:
            email = email_match["email"]
            pos = email_match["start"]
            prefix = lowered[max(0, pos-25):pos]
            if "cc" in prefix or "copy" in prefix:
                cc_email = email
                break
        if not cc_email:
            cc_email = email_matches[1]["email"]

    # Similar for BCC
    bcc_match = re.search(r"bcc\s*[:\-]?\s*([\w.+-]+@[\w-]+(?:\.[\w-]+)+)", lowered)
    if bcc_match:
        bcc_email = _split_email_candidate(bcc_match.group(1))[0]
    elif len(email_matches) > 2 and not bcc_email:
        for email_match in email_matches[1:]:
            email = email_match["email"]
            if email != cc_email:
                bcc_email = email
                break

    subject = _extract_labeled_value(
        text,
        ["subject", "sub"],
        ["body", "message", "saying", "say", "content"],
    )
    body = _extract_labeled_value(
        text,
        ["body", "message", "content", "saying", "say"],
        ["subject", "sub"],
    )

    after_email = text[email_matches[0]["end"]:].strip(" .,\n\t")
    if not body:
        body_match = re.search(
            r"(?:that|saying|say|message|body|content)\s+(.+)$",
            after_email,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if body_match:
            body = body_match.group(1).strip(" .\n\t\"'")

    # Detect attachment intent vs mentioning
    wants_attachment, file_hint = detect_attachment_intent(text)
    attachments = []
    if wants_attachment:
        resolved_att, err_msg = resolve_session_attachment(
            session_id=session_id,
            file_hint=file_hint,
            current_pdf_path=current_pdf_path,
            current_pdf_filename=current_pdf_filename,
            db_docs=db_docs,
        )
        if not resolved_att:
            target_name = file_hint if file_hint and file_hint not in {"file", "pdf", "document", "this", "it"} else "requested file"
            return {
                "error": (
                    f"I noticed you asked to attach your {target_name}, but I could not find or access that file in this session. "
                    "Please upload your file using the attachment button (paperclip) in the chat, and I will attach it to your email."
                )
            }
        attachments = [resolved_att]

    return {
        "action": "draft" if any(k in lowered for k in ["draft", "compose", "save"]) else "send",
        "to": to_email,
        "cc": cc_email,
        "bcc": bcc_email,
        "subject": subject,
        "body": body,
        "instructions": body or after_email or text,
        "attachments": attachments,
    }


async def compose_email_subject_and_body(email_request: dict, context: str = "") -> dict:
    """Generate a polished, clean subject/body for a pending email without raw asterisks."""
    if email_request.get("subject") and email_request.get("body"):
        return {
            "subject": email_request["subject"],
            "body": clean_email_body_plain(email_request["body"]),
        }

    prompt = (
        "Write a beautifully polished, professional email based on the user's request.\n"
        "Return exactly this format:\n"
        "Subject: <subject>\n"
        "Body:\n"
        "<email body>\n\n"
        "CRITICAL CONTENT & WRITING RULES:\n"
        "- Write naturally, warmly, and professionally as a human. Do not mention that you are an AI.\n"
        "- ABSOLUTELY DO NOT use markdown bolding ('**') anywhere in the email body. Emails must never contain raw asterisks or markdown code syntax.\n"
        "- For section headings, use clean capitalization with a colon on its own line (for example, 'Education:' or 'Technical Skills:', NEVER '**Education**').\n"
        "- For bullet points, use a standard dash '-' with clean natural text.\n"
        "- THOROUGH CONTEXT & DETAIL INCORPORATION:\n"
        "  If the user asks to mention or highlight specific details about an attached file, their background, projects, skills, or specific points (e.g. 'mention that it contains my academic background, technical skills, and AI/ML projects' or asks to highlight specific experience), you MUST actively and thoroughly include those details in the email body! NEVER output a generic one-liner like 'Please find my resume attached' when the user supplied specific points to mention.\n"
        "- ADAPTIVE LENGTH & DETAIL: Match the email length to the user's intent. If the user asks for a brief note, be concise while still covering the requested items. If the user lists multiple items or the provided document context contains relevant details, structure the email with clean paragraphs or sections covering those points.\n"
        "- DO NOT write 'Attachment: [filename]' or fake attachment text in the email body itself, because the file will be attached as a real binary file attachment to the email payload.\n"
        "- Ensure paragraphs are separated by clean blank lines and there is a professional sign-off.\n\n"
        f"Recipient: {email_request['to']}\n"
        f"Existing subject, if any: {email_request.get('subject') or '(none)'}\n"
        f"User request/instructions: {email_request.get('instructions') or '(none)'}\n"
    )
    detail_info = analyze_requested_detail(email_request.get("instructions", "") or email_request.get("body", ""))
    prompt += f"\nDETAIL & SCOPE GUIDANCE:\n{detail_info['guidance']}\n"
    if email_request.get("attachments"):
        att_names = ", ".join(a["filename"] for a in email_request["attachments"])
        prompt += f"Attached file(s): {att_names}\n"
    if context:
        prompt += f"\nRelevant document and memory context:\n{context}\n"

    writer = Agent(model=llama_model, markdown=False)
    result = await writer.arun(prompt)
    content = result.content.strip()

    subject_match = re.search(r"^Subject:\s*(.+)$", content, flags=re.IGNORECASE | re.MULTILINE)
    body_match = re.search(r"Body:\s*(.+)$", content, flags=re.IGNORECASE | re.DOTALL)

    subject = email_request.get("subject") or (
        subject_match.group(1).strip() if subject_match else "Message from Virtual Assist"
    )
    body = email_request.get("body") or (
        body_match.group(1).strip() if body_match else content
    )
    body = clean_email_body_plain(body)

    return {"subject": subject, "body": body}


def format_pending_email(email_request: dict) -> str:
    action = "save this draft" if email_request["action"] == "draft" else "send this email"
    cc_line = f"**Cc:** `{email_request['cc']}`\n" if email_request.get("cc") else ""
    bcc_line = f"**Bcc:** `{email_request['bcc']}`\n" if email_request.get("bcc") else ""

    attachment_line = ""
    attachments = email_request.get("attachments") or []
    if attachments:
        att_details = []
        for a in attachments:
            size_kb = max(1, round(a.get("size", 0) / 1024)) if a.get("size") else None
            size_str = f" ({size_kb} KB)" if size_kb else ""
            att_details.append(f"📎 `{a['filename']}`{size_str}")
        attachment_line = f"**Attachment:** {', '.join(att_details)}\n"

    clean_body = clean_email_body_plain(email_request.get("body", ""))
    return (
        f"Here is the email draft I prepared. Should I {action}?\n\n"
        f"**To:** `{email_request['to']}`\n"
        f"{cc_line}"
        f"{bcc_line}"
        f"**Subject:** {email_request['subject']}\n"
        f"{attachment_line}"
        f"---\n\n"
        f"{clean_body}\n\n"
        f"---\n\n"
        "Reply with **\"send it\"** to approve and send via Gmail, or **\"cancel\"** to discard."
    )


def format_email_action_result(action: str, result: dict) -> str:
    if not result.get("success"):
        return f"Gmail action failed: {result.get('error', 'Unknown error')}"
    atts = result.get("attachments") or []
    att_str = f" with attachment(s): {', '.join(atts)}" if atts else ""
    if action == "send":
        return f"Email sent successfully via Gmail{att_str}. Message ID: {result.get('message_id')}"
    if action == "reply":
        return f"Reply sent through Gmail successfully. Message ID: {result.get('message_id')}"
    if action == "draft":
        return f"Draft saved in Gmail successfully{att_str}. Draft ID: {result.get('draft_id')}"
    return result.get("message", "Gmail action completed successfully.")


def needs_search(user_text: str) -> bool:
    """Return whether web search actually succeeded during this request."""
    from tools.web_search import web_search_called
    return web_search_called.get()


def should_search(user_text: str) -> bool:
    """Return whether the user query should be answered with fresh web context."""
    text = user_text.lower()
    return any(k in text for k in SEARCH_KEYWORDS) or text.strip().endswith("?")


async def summarize_text(text: str) -> str:
    summarizer = Agent(model=llama_model, markdown=False)
    result = await summarizer.arun(
        f"Summarize the following conversation in 2-3 concise sentences:\n\n{text}"
    )
    return result.content


def _download_line(result: dict) -> str:
    return f"Download it here: http://localhost:8000{result['url']}"



def _extract_topic(user_text: str) -> str:
    patterns = [
        r"(?:make|create|generate|write)\s+(?:a\s+)?pdf\s+(?:on|about|for)\s+(.+)$",
        r"pdf\s+(?:on|about|for)\s+(.+)$",
    ]
    for pattern in patterns:
        match = re.search(pattern, user_text, flags=re.IGNORECASE | re.DOTALL)
        if match:
            return match.group(1).strip(" .\n\t\"'")
    return user_text.strip()


def _clean_find_replace_value(value: str) -> str:
    value = re.sub(r"\s+", " ", value or "").strip(" .\n\t\"'")
    value = re.sub(
        r"\s+(?:in|inside|on)\s+(?:the\s+)?(?:pdf|document|file)\s*$",
        "",
        value,
        flags=re.IGNORECASE,
    )
    return value.strip(" .\n\t\"'")


def _parse_find_replace(user_text: str) -> dict | None:
    text = re.sub(r"\s+", " ", user_text.strip())

    patterns = [
        # Example: Change NAME from MANDAVA SRI NAAGA SAAKETH to MANDAVA PRATHIMA
        r"\b(?:change|replace|update)\b(?:\s+(?!from\b).+?)?\s+from\s+(?P<find>.+?)\s+(?:to|with)\s+(?P<replace>.+)$",
        # Example: Replace MANDAVA SRI NAAGA SAAKETH with MANDAVA PRATHIMA
        r"\b(?:change|replace|update)\b\s+(?P<find>.+?)\s+(?:to|with)\s+(?P<replace>.+)$",
    ]

    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue

        find_value = _clean_find_replace_value(match.group("find"))
        replace_value = _clean_find_replace_value(match.group("replace"))
        if find_value and replace_value:
            return {"find": find_value, "replace": replace_value}

    return None


async def resolve_find_replace_with_llm(user_text: str, pdf_text: str) -> dict | None:
    prompt = (
        "You are a precise PDF text editing assistant.\n"
        "The user wants to replace some text in a PDF, but their search query might not match the PDF text exactly (due to typos, spacing, formatting, or context).\n"
        "Your job is to look at the user request and the actual PDF text, and identify the exact substring in the PDF that should be replaced, and what it should be replaced with.\n\n"
        f"User request: \"{user_text}\"\n\n"
        "Actual PDF Text:\n"
        "\"\"\"\n"
        f"{pdf_text[:15000]}\n"
        "\"\"\"\n\n"
        "Output a JSON object containing the exact substring to find in the PDF (must exist exactly in the PDF text) and the replacement text.\n"
        "Format: {\"find\": \"...\", \"replace\": \"...\"}\n"
        "Do not include any explanation or markdown formatting, output raw JSON only."
    )
    try:
        agent = Agent(model=llama_model, markdown=False)
        resp = await agent.arun(prompt)
        content = resp.content.strip()
        json_match = re.search(r"({.*?})", content, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(1))
            if "find" in data and "replace" in data:
                return {
                    "find": data["find"].strip(),
                    "replace": data["replace"].strip()
                }
    except Exception as e:
        print(f"Error in LLM find/replace resolution: {e}")
    return None


def _preserve_requested_replacement(parsed: dict, resolved: dict | None) -> dict | None:
    if not resolved:
        return None
    return {
        "find": resolved.get("find") or parsed["find"],
        "replace": parsed["replace"],
    }


def _parse_section_edit(user_text: str) -> dict:
    patterns = [
        r"(?:modify|update|replace|change)\s+(?:the\s+)?section\s+[\"']?(.+?)[\"']?\s+(?:with|to|as)\s+(.+)$",
        r"(?:modify|update|replace|change)\s+(.+?)\s+section\s+(?:with|to|as)\s+(.+)$",
        r"section\s+[\"']?(.+?)[\"']?\s*:\s*(.+)$",
    ]
    for pattern in patterns:
        match = re.search(pattern, user_text, flags=re.IGNORECASE | re.DOTALL)
        if match:
            return {
                "section": match.group(1).strip(" .\n\t\"'"),
                "replacement": match.group(2).strip(),
            }
    return {"section": "", "replacement": ""}


def _detect_long_form_request(user_text: str) -> dict:
    text = user_text.lower()
    # Find patterns like "1500 word", "1500 words", "1000-word" or just "1500"
    word_count_match = re.search(r"(\d+)\s*-\s*words?|(\d+)\s*words?", text)
    is_essay = any(w in text for w in ["essay", "report", "article", "thesis", "writeup", "write-up", "composition", "paper"])
    
    word_count = None
    if word_count_match:
        word_count = int(word_count_match.group(1) or word_count_match.group(2))
    elif "1500" in text:
        word_count = 1500
    elif "1000" in text:
        word_count = 1000
    elif "500" in text:
        word_count = 500

    # If the user asks for "long", "detailed", "essay", etc.
    is_long = is_essay or "detailed" in text or "long-form" in text or "long form" in text or (word_count is not None and word_count > 250)
    
    return {
        "is_long_form": is_long,
        "word_count": word_count or (1500 if is_essay else None),
        "is_essay": is_essay,
    }


async def handle_pdf_request(
    user_text: str,
    session_id: str,
    context: str = "",
    pdf_path: str | None = None,
    pdf_filename: str | None = None,
) -> str:
    text = user_text.lower()
    has_create_trigger = bool(re.search(
        r"\b(make|create|generate|write|build|produce)\b.{0,40}\bpdf\b",
        text,
    ))
    has_modify_trigger = any(k in text for k in ["modify", "update section", "replace section", "change section"])
    has_summary_trigger = any(k in text for k in ["summarize", "summarise", "summary"])
    has_extract_trigger = any(k in text for k in ["extract", "text from", "read this pdf", "read the pdf"])
    wants_paragraphs = any(k in text for k in ["paragraph", "paragraphs", "para", "prose"]) and any(
        k in text for k in ["point", "points", "bullet", "bullets", "wise", "instead"]
    )
    wants_bullets = any(k in text for k in ["point", "points", "bullet", "bullets", "list", "lists"]) and any(
        k in text for k in ["paragraph", "paragraphs", "para", "prose", "wise", "instead", "bullet points"]
    )
    wants_enrichment = any(k in text for k in [
        "more information", "more info", "add more", "more detail", "more details",
        "expand", "elaborate", "enrich", "not enough", "too short", "longer", "in depth",
    ])

    # Detect broad modification intent like "change X from Y to Z"
    has_change_pattern = bool(re.search(
        r"(?:change|replace|update|set|fix|correct)\s+.+?\s+(?:from|to|with)\s+",
        text,
    ))
    if has_change_pattern and not has_create_trigger:
        has_modify_trigger = True

    if has_create_trigger and not has_modify_trigger:
        topic = _extract_topic(user_text)
        info = _detect_long_form_request(user_text)
        
        if info["is_long_form"]:
            word_count = info["word_count"] or 1500
            # Generate outline
            outline_prompt = (
                f"We need to write a comprehensive, detailed {word_count}-word document/essay about: \"{topic}\".\n"
                "Please generate a detailed outline of 5 to 6 distinct, logical section headings that cover this topic in depth.\n"
                "Output ONLY a JSON list of strings representing the section headings. Do not include any formatting, markdown, numbering, or conversational filler.\n"
                "Example: [\"Introduction\", \"Historical Background\", \"Key Theories\", \"Modern Applications\", \"Future Trends\", \"Conclusion\"]"
            )
            if context:
                outline_prompt += f"\nRelevant memory/context:\n{context}\n"
                
            headings = []
            content = ""
            try:
                outline_agent = Agent(model=llama_model, markdown=False)
                outline_resp = await outline_agent.arun(outline_prompt)
                content = outline_resp.content.strip()
                json_match = re.search(r"(\[.*?\])", content, re.DOTALL)
                if json_match:
                    headings = json.loads(json_match.group(1))
            except Exception as e:
                print(f"Error parsing JSON outline: {e}")
                
            if not headings:
                # Line-by-line fallback
                for line in content.splitlines():
                    line_clean = line.strip().lstrip("0123456789.-*• ").strip()
                    if line_clean and not line_clean.startswith("[") and not line_clean.endswith("]"):
                        headings.append(line_clean)
                        
            if not headings or len(headings) < 3:
                headings = [
                    "Introduction",
                    "Historical Background",
                    "Core Concepts and Mechanisms",
                    "Modern Applications and Relevance",
                    "Key Challenges and Future Directions",
                    "Conclusion",
                ]
            
            # Now, for each section, write detailed prose
            full_body_parts = []
            for heading in headings:
                section_prompt = (
                    f"You are writing a comprehensive, detailed {word_count}-word document/essay about: \"{topic}\".\n"
                    f"Write a highly detailed, professional, and informative section under the heading: \"{heading}\".\n"
                    "Guidelines:\n"
                    "- Write multiple long, detailed paragraphs explaining the concepts in depth.\n"
                    "- Do not use lists or bullet points; write fully in prose.\n"
                    "- Focus on depth of explanation, rich detail, and academic tone.\n"
                    "- Aim for about 250 to 300 words for this section alone.\n"
                    "- Output ONLY the section content. Do not include the heading itself, and do not include any introductions or conclusions to other sections."
                )
                if context:
                    section_prompt += f"\nRelevant memory/context:\n{context}\n"
                    
                section_agent = Agent(model=llama_model, markdown=False)
                section_resp = await section_agent.arun(section_prompt)
                section_text = section_resp.content.strip()
                full_body_parts.append(f"**{heading}**\n\n{section_text}")
                
            body_content = "\n\n".join(full_body_parts)
            result = create_topic_pdf(topic, body_content)
            if not result.get("success"):
                return f"I could not create the PDF: {result.get('error', 'Unknown error')}"
            _remember_pdf(session_id, {
                "path": result["path"],
                "filename": result["filename"],
                "topic": topic,
            })
            return f"I created a neat PDF about {topic}.\n{_download_line(result)}"
        else:
            writer_prompt = (
                "Write a comprehensive, well-structured document about the following topic.\n"
                "Structure the document with clear section headings (use **Heading** on its own line).\n"
                "Write each section as multiple full paragraphs of flowing prose — do NOT use bullet points, numbered lists, or point-wise formatting.\n"
                "Each section should be detailed, informative, and written in a professional academic tone.\n"
                "Aim for at least 3 to 5 paragraphs per section.\n"
                "Do not include markdown table syntax. Keep it polished and readable.\n\n"
                f"Topic/request: {topic}\n"
            )
            if context:
                writer_prompt += f"\nRelevant memory/context:\n{context}\n"
            writer = Agent(model=llama_model, markdown=False)
            generated = await writer.arun(writer_prompt)
            result = create_topic_pdf(topic, generated.content.strip())
            if not result.get("success"):
                return f"I could not create the PDF: {result.get('error', 'Unknown error')}"
            _remember_pdf(session_id, {
                "path": result["path"],
                "filename": result["filename"],
                "topic": topic,
            })
            return f"I created a neat PDF about {topic}.\n{_download_line(result)}"

    remembered = _get_latest_pdf(session_id)

    # --- Enrich / expand existing PDF ---
    if wants_enrichment and remembered and not has_create_trigger:
        pdf_path = pdf_path or remembered["path"]
        pdf_filename = pdf_filename or remembered.get("filename")
        extraction = extract_pdf_text(pdf_path)
        if not extraction.get("success") or not extraction.get("text"):
            return "I found the last PDF, but I could not read its text to expand it."

        topic = remembered.get("topic") or (pdf_filename or "the document").rsplit(".", 1)[0].replace("_", " ")
        enrich_prompt = (
            "The user wants MORE information in this document. "
            "Rewrite and significantly expand the following PDF content. "
            "Add deeper explanations, additional facts, examples, and new subsections where appropriate. "
            "Make it at least twice as long as the original. "
            "Keep the same general structure (headings) but enrich every section with much more detail. "
            "Use section headings marked with **Heading** on their own line.\n\n"
            f"Original content:\n{extraction['text'][:15000]}"
        )
        if context:
            enrich_prompt += f"\n\nRecent/relevant context:\n{context}\n"

        writer = Agent(model=llama_model, markdown=False)
        enriched = await writer.arun(enrich_prompt)
        result = create_topic_pdf(topic, enriched.content.strip())
        if not result.get("success"):
            return f"I could not recreate the PDF with more information: {result.get('error', 'Unknown error')}"

        _remember_pdf(session_id, {
            "path": result["path"],
            "filename": result["filename"],
            "topic": topic,
        })
        return f"I recreated the PDF about {topic} with much more information.\n{_download_line(result)}"

    # --- Rewrite as paragraph prose ---
    if wants_paragraphs and remembered and not has_modify_trigger:
        pdf_path = pdf_path or remembered["path"]
        pdf_filename = pdf_filename or remembered.get("filename")
        extraction = extract_pdf_text(pdf_path)
        if not extraction.get("success") or not extraction.get("text"):
            return "I found the last PDF, but I could not read its text to rewrite it in paragraphs."

        topic = remembered.get("topic") or (pdf_filename or "the document").rsplit(".", 1)[0].replace("_", " ")
        rewrite_prompt = (
            "Rewrite the following PDF content as smooth paragraph-wise prose.\n"
            "Do not use bullet points, numbered lists, or point-wise formatting.\n"
            "Keep the same meaning and make it polished and readable.\n\n"
            f"Content:\n{extraction['text'][:12000]}"
        )
        if context:
            rewrite_prompt += f"\n\nRecent/relevant context:\n{context}\n"

        writer = Agent(model=llama_model, markdown=False)
        rewritten = await writer.arun(rewrite_prompt)
        result = create_topic_pdf(topic, rewritten.content.strip())
        if not result.get("success"):
            return f"I could not recreate the PDF in paragraph format: {result.get('error', 'Unknown error')}"

        _remember_pdf(session_id, {
            "path": result["path"],
            "filename": result["filename"],
            "topic": topic,
        })
        return f"I recreated the PDF in paragraph-wise format.\n{_download_line(result)}"

    # --- Rewrite as point-wise / bullets ---
    if wants_bullets and remembered and not has_modify_trigger:
        pdf_path = pdf_path or remembered["path"]
        pdf_filename = pdf_filename or remembered.get("filename")
        extraction = extract_pdf_text(pdf_path)
        if not extraction.get("success") or not extraction.get("text"):
            return "I found the last PDF, but I could not read its text to rewrite it in bullet points."

        topic = remembered.get("topic") or (pdf_filename or "the document").rsplit(".", 1)[0].replace("_", " ")
        rewrite_prompt = (
            "Rewrite the following PDF content as a clean, structured document using bullet points or numbered lists where appropriate.\n"
            "Use clear headings, and break down dense prose into concise bullet points or points-wise formatting.\n"
            "Keep the same meaning and make it polished and readable.\n\n"
            f"Content:\n{extraction['text'][:12000]}"
        )
        if context:
            rewrite_prompt += f"\n\nRecent/relevant context:\n{context}\n"

        writer = Agent(model=llama_model, markdown=False)
        rewritten = await writer.arun(rewrite_prompt)
        result = create_topic_pdf(topic, rewritten.content.strip())
        if not result.get("success"):
            return f"I could not recreate the PDF in bullet-points format: {result.get('error', 'Unknown error')}"

        _remember_pdf(session_id, {
            "path": result["path"],
            "filename": result["filename"],
            "topic": topic,
        })
        return f"I recreated the PDF in bullet-points format.\n{_download_line(result)}"

    if not pdf_path:
        if remembered:
            pdf_path = remembered["path"]
            pdf_filename = pdf_filename or remembered["filename"]
        else:
            return (
                "Please attach the PDF first. I can extract text, summarize it, or modify a named "
                "section while leaving the rest of the document unchanged."
            )

    if has_modify_trigger:
        extraction = extract_pdf_text(pdf_path)
        pdf_text = extraction.get("text", "")

        find_replace = _parse_find_replace(user_text)
        if find_replace:
            result = find_replace_in_pdf(pdf_path, find_replace["find"], find_replace["replace"])
            if result.get("success"):
                _remember_pdf(session_id, {"path": result["path"], "filename": result["filename"]})
                return (
                    f"I replaced \"{find_replace['find']}\" with \"{find_replace['replace']}\" in {pdf_filename or 'the PDF'} "
                    f"and preserved the rest of the document.\n{_download_line(result)}"
                )
            
            # Direct match failed, attempt LLM resolution fallback
            if pdf_text:
                resolved = await resolve_find_replace_with_llm(user_text, pdf_text)
                resolved = _preserve_requested_replacement(find_replace, resolved)
                if resolved:
                    result = find_replace_in_pdf(pdf_path, resolved["find"], resolved["replace"])
                    if result.get("success"):
                        _remember_pdf(session_id, {"path": result["path"], "filename": result["filename"]})
                        return (
                            f"I replaced \"{resolved['find']}\" with \"{resolved['replace']}\" in {pdf_filename or 'the PDF'} "
                            f"and preserved the rest of the document.\n{_download_line(result)}"
                        )

        elif pdf_text:
            resolved = await resolve_find_replace_with_llm(user_text, pdf_text)
            if resolved:
                result = find_replace_in_pdf(pdf_path, resolved["find"], resolved["replace"])
                if result.get("success"):
                    _remember_pdf(session_id, {"path": result["path"], "filename": result["filename"]})
                    return (
                        f"I replaced \"{resolved['find']}\" with \"{resolved['replace']}\" in {pdf_filename or 'the PDF'} "
                        f"and preserved the rest of the document.\n{_download_line(result)}"
                    )

        parsed = _parse_section_edit(user_text)
        if parsed["section"] and parsed["replacement"]:
            result = modify_pdf_section(pdf_path, parsed["section"], parsed["replacement"])
            if result.get("success"):
                _remember_pdf(session_id, {"path": result["path"], "filename": result["filename"]})
                return (
                    f"I updated only the \"{result['section']}\" section in {pdf_filename or 'the PDF'} "
                    f"and preserved the rest of the document.\n{_download_line(result)}"
                )

        return (
            "Tell me the section title and the exact replacement text, for example: "
            "modify section Introduction with <new text>.\n"
            "Or tell me to replace text directly, for example: change \"old text\" to \"new text\"."
        )

    extraction = extract_pdf_text(pdf_path)
    if not extraction.get("success"):
        return f"I could not read the PDF: {extraction.get('error', 'Unknown error')}"
    if not extraction["text"]:
        return "I could not find selectable text in that PDF. It may be scanned or image-only."

    if has_summary_trigger or not has_extract_trigger:
        summarizer = Agent(model=llama_model, markdown=False)
        pdf_detail = analyze_requested_detail(user_text)
        if pdf_detail["wants_concise"]:
            length_guide = "Provide a concise, direct summary in 1 to 2 crisp paragraphs or tight bullet points covering key takeaways."
        elif pdf_detail["wants_detailed"]:
            length_guide = "Provide an extensive, comprehensive, and structured breakdown covering all sections, background, methodology, key findings, and conclusions in detail."
        else:
            length_guide = "Summarize this PDF clearly. Include the main points, important details, and any action items or conclusions if present."

        summary_prompt = (
            f"{length_guide}\n\n"
            f"PDF: {pdf_filename or 'uploaded document'}\n"
            f"Pages: {extraction['page_count']}\n\n"
            f"{extraction['text']}"
        )
        summary = await summarizer.arun(summary_prompt)
        summary_text = summary.content.strip()
        note = "\n\nNote: I summarized the first extracted portion because the PDF is long." if extraction.get("truncated") else ""

        # Persist PDF content into vector memory so the assistant can recall it later
        await save_document_memory(
            session_id,
            extraction["text"],
            filename=pdf_filename,
            summary=summary_text,
            file_path=pdf_path,
        )

        return f"Here is the summary of {pdf_filename or 'the PDF'}:\n\n{summary_text}{note}"

    extracted = extraction["text"]
    if extraction.get("truncated"):
        extracted += "\n\n[Text was truncated because the PDF is long.]"

    # Persist PDF content into vector memory so the assistant can recall it later
    await save_document_memory(
        session_id,
        extraction["text"],
        filename=pdf_filename,
        file_path=pdf_path,
    )

    return f"Extracted text from {pdf_filename or 'the PDF'}:\n\n{extracted}"


async def generate_reply(
    user_text: str,
    session_id: str,
    pdf_path: str | None = None,
    pdf_filename: str | None = None,
    enable_web: bool | None = None,
) -> str:
    from tools.web_search import web_search_called
    web_search_called.set(False)
    email_last_action.set(None)

    # Process and save the uploaded PDF immediately to store it in session-scoped document memory
    if pdf_path:
        _remember_pdf(session_id, {"path": pdf_path, "filename": pdf_filename})
        extraction = extract_pdf_text(pdf_path)
        if not extraction.get("success"):
            return f"I encountered an error trying to read the PDF: {extraction.get('error', 'Unknown error')}"
        if not extraction.get("text"):
            return f"I opened \"{pdf_filename}\" but could not find any selectable text. It may be scanned, image-only, or empty."
        
        await save_document_memory(
            session_id=session_id,
            document_text=extraction["text"],
            filename=pdf_filename,
            file_path=pdf_path,
        )

    # Restore the session's PDF history list from the DB if not present in memory
    if session_id not in SESSION_PDFS or not SESSION_PDFS[session_id]:
        db_docs = await get_session_uploaded_documents(session_id)
        SESSION_PDFS[session_id] = db_docs

    # Find which PDF the user is referring to (e.g. "previous pdf", "previous previous pdf")
    active_pdf = find_referred_pdf(user_text, SESSION_PDFS.get(session_id, []))
    if active_pdf:
        pdf_path = active_pdf["path"]
        pdf_filename = active_pdf["filename"]

    active_filename = pdf_filename

    # 1. Retrieve Context Pipeline
    # Retrieve current session document content (filtered strictly by session_id and active_filename)
    document_context = await get_session_documents(session_id, active_filename)
    if not document_context and active_pdf and pdf_path:
        extraction = extract_pdf_text(pdf_path)
        if extraction.get("success") and extraction.get("text"):
            label = active_filename or "uploaded document"
            document_context = f"[Document: {label}]\n{extraction['text'][:12000]}"

    # Vector similarity search over all document memory chunks (works across sessions and within session)
    if not is_vague_followup(user_text) or not document_context:
        relevant_doc_chunks = await get_relevant_document_context(user_text, session_id)
        if relevant_doc_chunks:
            if document_context:
                document_context = f"{document_context}\n\nRelevant Document Chunks (Vector Search):\n{relevant_doc_chunks}"
            else:
                document_context = f"Relevant Document Content (Vector Search):\n{relevant_doc_chunks}"

    # Retrieve recent conversation turns within the session
    recent_context = await get_recent_context(session_id)

    # Search long-term memory/preferences
    long_term_context = ""
    if not is_vague_followup(user_text):
        long_term_context = await get_long_term_memory(user_text)

    # Search relevant conversation vector memory inside this session
    relevant_session_context = ""
    if not is_vague_followup(user_text):
        relevant_session_context = await get_relevant_context(
            user_text,
            session_id,
            include_summaries=True,
        )

    context_parts = []
    if document_context:
        context_parts.append(f"Uploaded Document Context:\n{document_context}")
    if recent_context:
        context_parts.append(f"Recent Conversation:\n{recent_context}")
    if relevant_session_context:
        context_parts.append(f"Relevant Conversation Memory:\n{relevant_session_context}")
    if long_term_context:
        context_parts.append(f"User Preferences & Long-Term Memory:\n{long_term_context}")

    context = "\n\n".join(context_parts)

    # ── Email routing (check BEFORE PDF to avoid mis-routing "write a mail" as PDF) ──
    pending_emails = PENDING_EMAILS.get(session_id, [])
    email_to_action, idx = find_referred_email(user_text, pending_emails)
    
    if email_to_action:
        user_approval_text = user_text.lower()
        is_approved_msg = is_approval(user_text) or any(k in user_approval_text for k in ["save", "draft", "keep", "send the", "send it", "mail it", "send the first", "send the mail before"])
        if is_approved_msg:
            is_draft_confirm = any(k in user_approval_text for k in ["draft", "save", "keep", "dont send", "don't send"])
            is_send_confirm = any(k in user_approval_text for k in ["send", "go ahead", "approve", "mail it"])
            
            final_action = email_to_action["action"]
            if is_send_confirm and not is_draft_confirm:
                final_action = "send"
            elif is_draft_confirm and not is_send_confirm:
                final_action = "draft"

            attachments = email_to_action.get("attachments") or None
            if final_action == "draft":
                result = draft_email(
                    email_to_action["to"],
                    email_to_action["subject"],
                    email_to_action["body"],
                    cc=email_to_action.get("cc"),
                    bcc=email_to_action.get("bcc"),
                    attachments=attachments,
                )
                reply = format_email_action_result("draft", result)
            else:
                result = send_email(
                    email_to_action["to"],
                    email_to_action["subject"],
                    email_to_action["body"],
                    cc=email_to_action.get("cc"),
                    bcc=email_to_action.get("bcc"),
                    attachments=attachments,
                )
                reply = format_email_action_result("send", result)

            if result.get("success"):
                PENDING_EMAILS[session_id].pop(idx)
            await save_conversation(user_text, reply, session_id)
            return reply

    if pending_emails and is_rejection(user_text):
        PENDING_EMAILS[session_id] = []
        reply = "Canceled. I did not send or save the pending emails."
        await save_conversation(user_text, reply, session_id)
        return reply

    # Check if user wants to attach a file or update an existing pending email
    wants_attach_check, file_hint_check = detect_attachment_intent(user_text)
    if pending_emails and (wants_attach_check or any(k in user_text.lower() for k in ["mention", "add my", "include my", "update", "change subject", "change body"])):
        target_pending = pending_emails[-1]
        if wants_attach_check:
            resolved_att, err_msg = resolve_session_attachment(
                session_id=session_id,
                file_hint=file_hint_check,
                current_pdf_path=pdf_path,
                current_pdf_filename=pdf_filename,
                db_docs=SESSION_PDFS.get(session_id, []),
            )
            if not resolved_att:
                target_name = file_hint_check if file_hint_check and file_hint_check not in {"file", "pdf", "document", "this", "it"} else "requested file"
                reply = (
                    f"I noticed you asked to attach your {target_name}, but I could not find or access that file in this session. "
                    "Please upload your file using the attachment button (paperclip) in the chat, and I will attach it to your email."
                )
                await save_conversation(user_text, reply, session_id)
                return reply
            target_pending["attachments"] = [resolved_att]

        if any(k in user_text.lower() for k in ["mention", "include", "saying", "contain", "with", "add"]):
            target_pending["instructions"] = f"{target_pending.get('instructions', '')}\nUser added instructions: {user_text}"
            composed = await compose_email_subject_and_body(target_pending, context)
            target_pending.update(composed)

        reply = format_pending_email(target_pending)
        await save_conversation(user_text, reply, session_id)
        return reply

    direct_email = parse_direct_email_request(
        user_text,
        session_id=session_id,
        current_pdf_path=pdf_path,
        current_pdf_filename=pdf_filename,
        db_docs=SESSION_PDFS.get(session_id, []),
    )
    if direct_email:
        if direct_email.get("error"):
            reply = direct_email["error"]
        else:
            composed = await compose_email_subject_and_body(direct_email, context)
            direct_email.update(composed)
            if session_id not in PENDING_EMAILS:
                PENDING_EMAILS[session_id] = []
            PENDING_EMAILS[session_id].append(direct_email)
            reply = format_pending_email(direct_email)

        await save_conversation(user_text, reply, session_id)
        return reply

    # ── PDF routing (after email, so "write a mail" doesn't get caught) ──
    if needs_pdf(user_text, pdf_path, session_id) or is_pdf_style_followup(user_text, session_id):
        reply = await handle_pdf_request(user_text, session_id, context, pdf_path, pdf_filename)
        await save_conversation(user_text, reply, session_id)
        return reply

    # 2. Route to the right model
    model = pick_model(user_text)

    # 3. Dynamic requested detail evaluation
    detail_info = analyze_requested_detail(user_text, context)

    # 4. Build system prompt with anti-hallucination, grounding, and adaptive detail rules
    system_message = (
        "You are Nexus, a helpful, precise, and strictly grounded personal AI assistant.\n\n"
        "CORE RULES & GROUNDING:\n"
        "1. GROUNDING & HONESTY: For questions regarding personal user information, stored facts, or contents of uploaded documents/PDFs, answer ONLY using the provided context/memory. If the required information is NOT present in the provided context or memory, explicitly and clearly state: 'I don't have that information in my memory/context' or explain that the information is unavailable. DO NOT guess, fabricate, assume, or invent fake facts, user details, dates, or document contents.\n"
        "2. ADAPTIVE RESPONSE DETAIL & SCOPE:\n"
        "   - Intelligently calibrate response length, depth, and structure based on what the user asks and how much information they provide.\n"
        "   - SHORT / CONCISE: If the user asks for something short, brief, or in simple terms (e.g. 'Explain RAG in simple terms'), provide a crisp, concise, high-impact answer without unnecessary filler or excessive preambles.\n"
        "   - COMPREHENSIVE / DETAILED: If the user asks for a detailed, in-depth, or multi-faceted explanation covering multiple topics or components (e.g. 'Explain RAG from basics, architecture, workflow, components, embeddings, vector databases, retrieval, generation, and give an example'), provide an exhaustive, structured explanation covering every requested aspect, concept, and component in depth.\n"
        "   - RESPECT CONTEXT: If the user provides a large amount of context or detailed specifications, preserve and address all important facts, data points, and constraints without unnecessarily discarding them.\n"
        "   - MINIMAL CONTEXT: If the user provides very little information or a brief prompt, do NOT artificially generate a huge response unless the task genuinely requires it.\n"
        "   - DO NOT use a fixed response length or fixed verbosity for every request. Adapt naturally across all tasks: explanations, code, summaries, emails, documents, analysis, search results, recommendations, and planning.\n"
        "   - For math calculations, state the final result clearly in plain numbers without unprompted raw LaTeX commands.\n"
        "3. INTENT ALIGNMENT: Analyze the user's LATEST message carefully. If the user asks a NEW, distinct query, answer THAT current query directly without repeating past responses or irrelevant previous tool results.\n"
        "4. CONTEXT SCOPING: Use previous conversation context only when relevant to resolving references or follow-up questions (e.g. pronouns like 'it', 'this', 'its'). Do not mix unrelated memories from prior conversations into the response.\n"
        "5. CLEAN WRITING STYLE & FORMATTING:\n"
        "   - Write with high clarity, elegance, and natural flow. Avoid visual clutter.\n"
        "   - AVOID EXCESSIVE ASTERISKS: Do not litter responses or summaries with double asterisks '**' on every label, key, or bullet point. Only use bolding sparingly for vital emphasis.\n"
        "   - Use clean Markdown headers (e.g. '### Overview') and well-spaced paragraphs instead of pseudo-bold header lines.\n"
        "   - For emails, letters, and drafts: ABSOLUTELY NEVER use raw markdown symbols (do not use '**', '###', '---', or backticks). Write natural, human-formatted professional correspondence.\n\n"
    )
    system_message += f"ADAPTIVE DETAIL DIRECTIVE FOR THIS REQUEST:\n{detail_info['guidance']}\n\n"
    if context:
        system_message += f"CONVERSATION HISTORY & BACKGROUND CONTEXT:\n{context}\n\n"

    # 5. Build and run agent — attach tools based on query type
    text = user_text.lower()
    has_search_trigger = should_search(user_text) if enable_web is None else (enable_web and should_search(user_text))
    has_email_trigger = needs_email(user_text)

    if has_search_trigger:
        try:
            search_results = await search_web(user_text)
            system_message += (
                "\nWEB SEARCH RESULTS:\n"
                f"{search_results}\n\n"
                "Use these fresh search results when answering. "
                "Do not say you lack real-time access if search results are provided.\n"
            )
        except Exception as exc:
            system_message += (
                "\nWEB SEARCH STATUS:\n"
                f"Web search was attempted but failed: {exc}\n"
                "Tell the user search failed and answer only if the answer is available from non-current knowledge.\n"
            )

    # Prepare session-aware attachment for tool calling fallback
    session_attachment = None
    if wants_attach_check:
        session_attachment, _ = resolve_session_attachment(
            session_id=session_id,
            file_hint=file_hint_check,
            current_pdf_path=pdf_path,
            current_pdf_filename=pdf_filename,
            db_docs=SESSION_PDFS.get(session_id, []),
        )

    def send_email_with_attachments(to: str, subject: str, body: str, cc: str = None, bcc: str = None):
        """Send an email to a recipient via Gmail API with attachments if requested."""
        atts = [session_attachment] if session_attachment else None
        return send_email(to=to, subject=subject, body=body, cc=cc, bcc=bcc, attachments=atts)

    def draft_email_with_attachments(to: str, subject: str, body: str, cc: str = None, bcc: str = None):
        """Save an email draft in Gmail with attachments if requested."""
        atts = [session_attachment] if session_attachment else None
        return draft_email(to=to, subject=subject, body=body, cc=cc, bcc=bcc, attachments=atts)

    tools = []
    if has_email_trigger:
        tools += [send_email_with_attachments, read_inbox, search_emails, reply_to_email, draft_email_with_attachments]

    if has_email_trigger:
        system_message += (
            "\nEMAIL RULES:\n"
            "- When asked to send or draft an email, write a polished, professional email body.\n"
            "- STRICT: DO NOT use markdown bolding '**' or markdown headings in email bodies. "
            "Emails must be clean plain text or natural prose without raw asterisks or markup.\n"
            "- Use clean section labels (e.g. 'Education:' or 'Technical Skills:') and clean bullet points (- or •).\n"
            "- When asked to read/check inbox, use read_inbox() then summarize results clearly.\n"
            "- When asked to search emails, use search_emails(query) with Gmail query syntax.\n"
            "- When asked to reply, use reply_to_email(thread_id, message_id, to, subject, body).\n"
            "- When asked to draft, use draft_email(to, subject, body).\n"
            "- Never claim an email was sent, replied to, or drafted unless the tool returns success=True.\n"
            "- If the tool returns an error, tell the user the exact error and do not say the action succeeded.\n"
        )

    agent = Agent(
        model=model,
        system_message=system_message,
        tools=tools,
        markdown=False,
    )

    result = await agent.arun(user_text)
    reply = result.content
    last_email_action = email_last_action.get()

    if has_email_trigger and is_email_write_request(user_text):
        if not last_email_action:
            reply = (
                "I did not send or draft anything. Please include the recipient email address "
                "and body, for example: send email to person@example.com subject Hello body Your message."
            )
        elif not last_email_action.get("success"):
            reply = format_email_action_result(last_email_action.get("action"), last_email_action)
        else:
            reply = format_email_action_result(last_email_action.get("action"), last_email_action)

    # 5. Save this exchange to memory
    await save_conversation(user_text, reply, session_id)

    # 6. Rolling summary if too many raw turns
    if await count_raw_turns(session_id) > 10:
        await summarize_old_turns(session_id, summarize_text)

    return reply
