"""
Gmail API tools for the AI agent.
Provides send, read, search, reply, draft, and detail functions.
"""

import base64
import re
from contextvars import ContextVar
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from gmail_auth import get_gmail_service

email_last_action = ContextVar("email_last_action", default=None)


def _record_email_action(action: str, result: dict) -> dict:
    email_last_action.set({"action": action, **result})
    return result


def _decode_body(payload: dict) -> str:
    """Recursively decode email body from MIME payload."""
    body = ""
    if payload.get("body", {}).get("data"):
        body = base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", errors="replace")
    elif payload.get("parts"):
        for part in payload["parts"]:
            if part.get("mimeType") == "text/plain":
                data = part.get("body", {}).get("data", "")
                if data:
                    body = base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
                    break
            elif part.get("mimeType") == "text/html" and not body:
                data = part.get("body", {}).get("data", "")
                if data:
                    raw = base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
                    body = re.sub(r"<[^>]+>", " ", raw).strip()
    return body.strip()


def _get_header(headers: list, name: str) -> str:
    for h in headers:
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""


def send_email(to: str, subject: str, body: str, cc: str = None, bcc: str = None) -> dict:
    """Send an email via Gmail API. Returns status dict."""
    try:
        service = get_gmail_service()
        msg = MIMEMultipart("alternative")
        msg["To"] = to
        if cc:
            msg["Cc"] = cc
        if bcc:
            msg["Bcc"] = bcc
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()
        return _record_email_action("send", {
            "success": True,
            "message": f"Email sent to {to}" + (f" (Cc: {cc})" if cc else ""),
            "message_id": sent.get("id"),
            "thread_id": sent.get("threadId"),
        })
    except Exception as e:
        return _record_email_action("send", {"success": False, "error": str(e)})


def read_inbox(max_results: int = 10) -> list[dict]:
    """
    Fetch the latest emails from inbox.
    Returns list of {id, threadId, from, subject, date, snippet, unread}.
    """
    try:
        service = get_gmail_service()
        result = service.users().messages().list(
            userId="me",
            labelIds=["INBOX"],
            maxResults=max_results,
        ).execute()

        messages = result.get("messages", [])
        emails = []
        for msg in messages:
            detail = service.users().messages().get(
                userId="me", id=msg["id"], format="metadata",
                metadataHeaders=["From", "Subject", "Date"],
            ).execute()
            headers = detail.get("payload", {}).get("headers", [])
            labels = detail.get("labelIds", [])
            emails.append({
                "id": msg["id"],
                "threadId": msg["threadId"],
                "from": _get_header(headers, "From"),
                "subject": _get_header(headers, "Subject"),
                "date": _get_header(headers, "Date"),
                "snippet": detail.get("snippet", ""),
                "unread": "UNREAD" in labels,
            })
        return emails
    except Exception as e:
        return [{"error": str(e)}]


def get_email_detail(message_id: str) -> dict:
    """Get the full content of a specific email by message ID."""
    try:
        service = get_gmail_service()
        detail = service.users().messages().get(
            userId="me", id=message_id, format="full"
        ).execute()
        headers = detail.get("payload", {}).get("headers", [])
        body = _decode_body(detail.get("payload", {}))
        return {
            "id": message_id,
            "threadId": detail.get("threadId"),
            "from": _get_header(headers, "From"),
            "to": _get_header(headers, "To"),
            "subject": _get_header(headers, "Subject"),
            "date": _get_header(headers, "Date"),
            "body": body,
            "unread": "UNREAD" in detail.get("labelIds", []),
        }
    except Exception as e:
        return {"error": str(e)}


def search_emails(query: str, max_results: int = 10) -> list[dict]:
    """
    Search emails using Gmail query syntax.
    E.g. query='from:amazon@amazon.com', 'subject:invoice', 'is:unread'
    """
    try:
        service = get_gmail_service()
        result = service.users().messages().list(
            userId="me", q=query, maxResults=max_results
        ).execute()
        messages = result.get("messages", [])
        emails = []
        for msg in messages:
            detail = service.users().messages().get(
                userId="me", id=msg["id"], format="metadata",
                metadataHeaders=["From", "Subject", "Date"],
            ).execute()
            headers = detail.get("payload", {}).get("headers", [])
            emails.append({
                "id": msg["id"],
                "threadId": msg["threadId"],
                "from": _get_header(headers, "From"),
                "subject": _get_header(headers, "Subject"),
                "date": _get_header(headers, "Date"),
                "snippet": detail.get("snippet", ""),
            })
        return emails
    except Exception as e:
        return [{"error": str(e)}]


def reply_to_email(thread_id: str, message_id: str, to: str, subject: str, body: str) -> dict:
    """Reply to an email thread."""
    try:
        service = get_gmail_service()
        msg = MIMEMultipart("alternative")
        msg["To"] = to
        msg["Subject"] = f"Re: {subject}" if not subject.startswith("Re:") else subject
        msg["In-Reply-To"] = message_id
        msg["References"] = message_id
        msg.attach(MIMEText(body, "plain"))
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        sent = service.users().messages().send(
            userId="me",
            body={"raw": raw, "threadId": thread_id}
        ).execute()
        return _record_email_action("reply", {
            "success": True,
            "message": "Reply sent",
            "message_id": sent.get("id"),
            "thread_id": sent.get("threadId"),
        })
    except Exception as e:
        return _record_email_action("reply", {"success": False, "error": str(e)})


def draft_email(to: str, subject: str, body: str, cc: str = None, bcc: str = None) -> dict:
    """Save an email as a draft (does not send)."""
    try:
        service = get_gmail_service()
        msg = MIMEMultipart("alternative")
        msg["To"] = to
        if cc:
            msg["Cc"] = cc
        if bcc:
            msg["Bcc"] = bcc
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))
        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        draft = service.users().drafts().create(
            userId="me", body={"message": {"raw": raw}}
        ).execute()
        return _record_email_action("draft", {
            "success": True,
            "draft_id": draft["id"],
            "message": f"Draft saved for {to}" + (f" (Cc: {cc})" if cc else ""),
        })
    except Exception as e:
        return _record_email_action("draft", {"success": False, "error": str(e)})


def mark_as_read(message_id: str) -> dict:
    """Mark an email as read."""
    try:
        service = get_gmail_service()
        service.users().messages().modify(
            userId="me", id=message_id,
            body={"removeLabelIds": ["UNREAD"]}
        ).execute()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_unread_count() -> int:
    """Return number of unread emails in inbox."""
    try:
        service = get_gmail_service()
        result = service.users().messages().list(
            userId="me", labelIds=["INBOX", "UNREAD"], maxResults=1
        ).execute()
        return result.get("resultSizeEstimate", 0)
    except Exception:
        return 0
