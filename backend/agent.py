import os
import re
from dotenv import load_dotenv
from agno.agent import Agent
from agno.models.ollama import Ollama
from tools.web_search import search_web
from tools.email_tool import (
    draft_email,
    email_last_action,
    read_inbox,
    reply_to_email,
    search_emails,
    send_email,
)
from memory import get_relevant_context, save_conversation, count_raw_turns, summarize_old_turns

load_dotenv()

OLLAMA_HOST = os.getenv("OLLAMA_URL", "http://localhost:11434")

# Primary model — general reasoning and chat
llama_model = Ollama(id="llama3.1:8b", host=OLLAMA_HOST)

# Secondary model — coding / multilingual tasks
qwen_model = Ollama(id="qwen2.5:7b", host=OLLAMA_HOST)

CODE_KEYWORDS = ["code", "script", "python", "function", "debug", "error", "class ", "fix this", "write a program"]

SEARCH_KEYWORDS = [
    "latest", "current", "today", "news", "weather", "price", "stock",
    "who", "what", "where", "when", "why", "how", "won", "winner", "score",
    "president", "prime minister", "population", "temperature", "forecast",
    "recent", "now", "2026", "search", "game", "match", "vs", "versus"
]

EMAIL_KEYWORDS = [
    "send email", "send an email", "email to", "mail to", "write an email",
    "compose email", "draft email", "draft an email",
    "read email", "check email", "check my email", "open email",
    "inbox", "unread", "my emails", "new emails",
    "reply to", "reply to email", "respond to email",
    "search email", "find email", "emails from", "email from",
    "forward email",
]

EMAIL_ADDRESS_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
PENDING_EMAILS: dict[str, dict] = {}

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


def is_email_write_request(user_text: str) -> bool:
    text = user_text.lower()
    write_keywords = [
        "send email", "send an email", "email to", "mail to",
        "reply to", "reply to email", "respond to email",
        "draft email", "draft an email", "compose email",
    ]
    return any(k in text for k in write_keywords)


def _extract_labeled_value(text: str, labels: list[str], stop_labels: list[str]) -> str:
    label_pattern = "|".join(re.escape(label) for label in labels)
    stop_pattern = "|".join(re.escape(label) for label in stop_labels)
    match = re.search(
        rf"(?:{label_pattern})\s*[:\-]?\s*(.+?)(?=\s+(?:{stop_pattern})\s*[:\-]?|$)",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    return match.group(1).strip(" .\n\t\"'") if match else ""


def is_approval(text: str) -> bool:
    normalized = re.sub(r"[^\w\s]", "", text.strip().lower())
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized in APPROVAL_KEYWORDS


def is_rejection(text: str) -> bool:
    normalized = re.sub(r"[^\w\s]", "", text.strip().lower())
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized in REJECTION_KEYWORDS


def parse_direct_email_request(user_text: str) -> dict | None:
    """Parse straightforward send/draft commands without relying on tool calling."""
    text = user_text.strip()
    lowered = text.lower()
    if not is_email_write_request(text):
        return None
    if any(k in lowered for k in ["reply to", "reply to email", "respond to email"]):
        return None

    email_match = EMAIL_ADDRESS_RE.search(text)
    if not email_match:
        return {
            "error": "I need the recipient's email address before I can send it.",
        }

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

    after_email = text[email_match.end():].strip(" .,\n\t")
    if not body:
        body_match = re.search(
            r"(?:that|saying|say|message|body|content)\s+(.+)$",
            after_email,
            flags=re.IGNORECASE | re.DOTALL,
        )
        if body_match:
            body = body_match.group(1).strip(" .\n\t\"'")

    return {
        "action": "draft" if "draft" in lowered or "compose" in lowered else "send",
        "to": email_match.group(0),
        "subject": subject,
        "body": body,
        "instructions": body or after_email or text,
    }


async def compose_email_subject_and_body(email_request: dict, context: str = "") -> dict:
    """Generate a polished subject/body for a pending email."""
    if email_request.get("subject") and email_request.get("body"):
        return {
            "subject": email_request["subject"],
            "body": email_request["body"],
        }

    prompt = (
        "Write a concise, ready-to-send email based on the user's request.\n"
        "Return exactly this format:\n"
        "Subject: <subject>\n"
        "Body:\n"
        "<email body>\n\n"
        "Keep it professional and natural. Do not mention that you are an AI.\n\n"
        f"Recipient: {email_request['to']}\n"
        f"Existing subject, if any: {email_request.get('subject') or '(none)'}\n"
        f"User request/instructions: {email_request.get('instructions') or '(none)'}\n"
    )
    if context:
        prompt += f"\nRelevant memory/context:\n{context}\n"

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

    return {"subject": subject, "body": body}


def format_pending_email(email_request: dict) -> str:
    action = "save this draft" if email_request["action"] == "draft" else "send this email"
    return (
        f"Here is the email I prepared. Should I {action}?\n\n"
        f"To: {email_request['to']}\n"
        f"Subject: {email_request['subject']}\n\n"
        f"{email_request['body']}\n\n"
        "Reply with \"send it\" to approve, or \"cancel\" to discard."
    )


def format_email_action_result(action: str, result: dict) -> str:
    if not result.get("success"):
        return f"Gmail action failed: {result.get('error', 'Unknown error')}"
    if action == "send":
        return f"Email sent to Gmail successfully. Message ID: {result.get('message_id')}"
    if action == "reply":
        return f"Reply sent through Gmail successfully. Message ID: {result.get('message_id')}"
    if action == "draft":
        return f"Draft saved in Gmail successfully. Draft ID: {result.get('draft_id')}"
    return result.get("message", "Gmail action completed successfully.")


def needs_search(user_text: str) -> bool:
    # First check if the tool was actually called during execution
    from tools.web_search import web_search_called
    if web_search_called.get():
        return True
    
    # Fallback/pre-evaluation check for gating (can be used inside agent)
    text = user_text.lower()
    return any(k in text for k in SEARCH_KEYWORDS) or text.strip().endswith("?")


async def summarize_text(text: str) -> str:
    summarizer = Agent(model=llama_model, markdown=False)
    result = await summarizer.arun(
        f"Summarize the following conversation in 2-3 concise sentences:\n\n{text}"
    )
    return result.content


async def generate_reply(user_text: str, session_id: str) -> str:
    from tools.web_search import web_search_called
    web_search_called.set(False)
    email_last_action.set(None)

    # 1. Retrieve relevant memory
    context = await get_relevant_context(user_text, session_id)

    pending_email = PENDING_EMAILS.get(session_id)
    if pending_email and is_approval(user_text):
        if pending_email["action"] == "draft":
            result = draft_email(
                pending_email["to"],
                pending_email["subject"],
                pending_email["body"],
            )
            reply = format_email_action_result("draft", result)
        else:
            result = send_email(
                pending_email["to"],
                pending_email["subject"],
                pending_email["body"],
            )
            reply = format_email_action_result("send", result)

        PENDING_EMAILS.pop(session_id, None)
        await save_conversation(user_text, reply, session_id)
        return reply

    if pending_email and is_rejection(user_text):
        PENDING_EMAILS.pop(session_id, None)
        reply = "Canceled. I did not send or save that email."
        await save_conversation(user_text, reply, session_id)
        return reply

    direct_email = parse_direct_email_request(user_text)
    if direct_email:
        if direct_email.get("error"):
            reply = direct_email["error"]
        else:
            composed = await compose_email_subject_and_body(direct_email, context)
            direct_email.update(composed)
            PENDING_EMAILS[session_id] = direct_email
            reply = format_pending_email(direct_email)

        await save_conversation(user_text, reply, session_id)
        return reply

    # 2. Route to the right model
    model = pick_model(user_text)

    # 3. Build system prompt
    system_message = (
        "You are a helpful personal AI assistant running locally.\n\n"
        "RULES:\n"
        "1. For math, general knowledge, reasoning, or anything you already know — "
        "answer directly in plain English.\n"
        "2. Be concise and direct.\n\n"
    )
    if context:
        system_message += f"Relevant memory:\n{context}\n"

    # 4. Build and run agent — attach tools based on query type
    text = user_text.lower()
    has_search_trigger = any(k in text for k in SEARCH_KEYWORDS) or text.strip().endswith("?")
    has_email_trigger = needs_email(user_text)

    tools = []
    if has_search_trigger:
        tools.append(search_web)
    if has_email_trigger:
        tools += [send_email, read_inbox, search_emails, reply_to_email, draft_email]

    if has_email_trigger:
        system_message += (
            "\nEMAIL RULES:\n"
            "- When asked to send an email, use send_email(to, subject, body). "
            "Generate a professional body if the user only gave a brief description.\n"
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
