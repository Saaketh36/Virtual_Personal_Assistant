"""
Gmail API tools for the AI agent.
Provides send, read, search, reply, draft, and detail functions.
"""

import base64
import re
import mimetypes
from contextvars import ContextVar
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from gmail_auth import get_gmail_service

email_last_action = ContextVar("email_last_action", default=None)


def _record_email_action(action: str, result: dict) -> dict:
    email_last_action.set({"action": action, **result})
    return result


import html


def clean_email_body_plain(text: str) -> str:
    """Clean markdown artifacts to produce natural, executive-grade plain text without raw asterisks."""
    if not text:
        return ""
    # 1. Clean standalone bold lines like **Education** or **Education**: to Education:
    text = re.sub(r'^\s*\*\*(.+?)\*\*\s*:?\s*$', r'\1:', text, flags=re.MULTILINE)
    # 2. Clean inline bold like 1. **Project Name** -> 1. Project Name
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    # 3. Clean markdown headers like ### Heading -> Heading:
    text = re.sub(r'^\s*#{1,6}\s*(.+?)\s*$', r'\1:', text, flags=re.MULTILINE)
    # 4. Clean accidental horizontal rules
    text = re.sub(r'^\s*[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)
    # 5. Clean backticks
    text = re.sub(r'`([^`]+)`', r'\1', text)
    # 6. Normalize double colons if any occurred
    text = re.sub(r':\s*:', ':', text)
    return text.strip()


def email_body_to_html(raw_text: str) -> str:
    """Convert email markdown/plain body to rich, beautiful, modern HTML email."""
    if not raw_text:
        return ""

    lines = raw_text.splitlines()
    html_parts = []
    in_list = False
    list_tag = "ul"

    for line in lines:
        stripped = line.strip()

        # Empty line
        if not stripped:
            if in_list:
                html_parts.append(f"</{list_tag}>")
                in_list = False
            continue

        # Check for bullet point: - or * or •
        bullet_match = re.match(r'^[-*•]\s+(.*)$', stripped)
        # Check for numbered point: 1. or 1)
        num_match = re.match(r'^(\d+)[.)]\s+(.*)$', stripped)

        if bullet_match:
            if not in_list or list_tag != "ul":
                if in_list:
                    html_parts.append(f"</{list_tag}>")
                html_parts.append('<ul style="margin: 8px 0 12px 20px; padding-left: 0; color: #334155;">')
                in_list = True
                list_tag = "ul"
            item_text = bullet_match.group(1)
            item_escaped = html.escape(item_text)
            item_escaped = re.sub(r'\*\*(.+?)\*\*', r'<strong style="color: #0f172a; font-weight: 600;">\1</strong>', item_escaped)
            html_parts.append(f'<li style="margin-bottom: 6px; line-height: 1.55;">{item_escaped}</li>')
            continue

        if num_match:
            if not in_list or list_tag != "ol":
                if in_list:
                    html_parts.append(f"</{list_tag}>")
                html_parts.append('<ol style="margin: 8px 0 12px 20px; padding-left: 0; color: #334155;">')
                in_list = True
                list_tag = "ol"
            item_text = num_match.group(2)
            item_escaped = html.escape(item_text)
            item_escaped = re.sub(r'\*\*(.+?)\*\*', r'<strong style="color: #0f172a; font-weight: 600;">\1</strong>', item_escaped)
            html_parts.append(f'<li style="margin-bottom: 6px; line-height: 1.55;">{item_escaped}</li>')
            continue

        if in_list:
            html_parts.append(f"</{list_tag}>")
            in_list = False

        # Check if heading (### or **Heading** on its own line)
        heading_match = re.match(r'^(?:#{1,6}\s*|\*\*)(.+?)(?:\*\*|:)?\s*$', stripped)
        if heading_match and len(stripped) < 80 and not stripped.endswith('.'):
            title = html.escape(heading_match.group(1).strip())
            html_parts.append(f'<h3 style="margin: 18px 0 8px 0; font-size: 15px; font-weight: 600; color: #0f172a; letter-spacing: -0.2px;">{title}</h3>')
            continue

        # Standard paragraph
        p_text = html.escape(stripped)
        p_text = re.sub(r'\*\*(.+?)\*\*', r'<strong style="color: #0f172a; font-weight: 600;">\1</strong>', p_text)
        html_parts.append(f'<p style="margin: 0 0 12px 0; line-height: 1.6; color: #1e293b;">{p_text}</p>')

    if in_list:
        html_parts.append(f"</{list_tag}>")

    inner_html = "\n".join(html_parts)

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14.5px; line-height: 1.6; color: #1e293b; margin: 0; padding: 16px;">
{inner_html}
</body>
</html>"""


def _decode_body(payload: dict) -> str:
    """Recursively decode email body from MIME payload."""
    plain_text = ""
    html_text = ""

    def _extract_parts(part):
        nonlocal plain_text, html_text
        mime = part.get("mimeType", "")
        data = part.get("body", {}).get("data", "")
        if data:
            try:
                decoded = base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
                if mime == "text/plain" and not plain_text:
                    plain_text = decoded
                elif mime == "text/html" and not html_text:
                    html_text = decoded
            except Exception:
                pass
        for sub in part.get("parts", []):
            _extract_parts(sub)

    _extract_parts(payload)
    if plain_text:
        return plain_text.strip()
    if html_text:
        cleaned = re.sub(r"<(script|style)[^>]*>[\s\S]*?</\1>", "", html_text, flags=re.IGNORECASE)
        cleaned = re.sub(r"<br\s*/?>", "\n", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"</p>", "\n\n", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"</div>", "\n", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"<[^>]+>", " ", cleaned)
        return re.sub(r"[ \t]+", " ", cleaned).strip()
    return ""


def _get_header(headers: list, name: str) -> str:
    for h in headers:
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""


def send_email(
    to: str,
    subject: str,
    body: str,
    cc: str = None,
    bcc: str = None,
    attachments: list[dict] | None = None,
) -> dict:
    """Send an email via Gmail API with optional attachments and clean HTML/Plain multipart format."""
    try:
        service = get_gmail_service()
        plain_body = clean_email_body_plain(body)
        html_body = email_body_to_html(body)

        if attachments:
            msg = MIMEMultipart("mixed")
            msg["To"] = to
            if cc:
                msg["Cc"] = cc
            if bcc:
                msg["Bcc"] = bcc
            msg["Subject"] = subject

            # Multipart alternative for rich email clients + plain fallback
            alt_part = MIMEMultipart("alternative")
            alt_part.attach(MIMEText(plain_body, "plain", "utf-8"))
            alt_part.attach(MIMEText(html_body, "html", "utf-8"))
            msg.attach(alt_part)

            for att in attachments:
                fname = att.get("filename", "attachment")
                content = att.get("content", b"")
                if not content and att.get("path") and os.path.isfile(att["path"]):
                    try:
                        with open(att["path"], "rb") as af:
                            content = af.read()
                    except Exception as fe:
                        print(f"[email_tool] Failed to read attachment from {att['path']}: {fe}")

                ctype = att.get("content_type")
                if not ctype:
                    ctype, _ = mimetypes.guess_type(fname)
                if not ctype:
                    ctype = "application/octet-stream"

                maintype, subtype = ctype.split("/", 1) if "/" in ctype else ("application", "octet-stream")
                part = MIMEBase(maintype, subtype)
                part.set_payload(content)
                encoders.encode_base64(part)
                part.add_header("Content-Disposition", "attachment", filename=fname)
                msg.attach(part)
        else:
            msg = MIMEMultipart("alternative")
            msg["To"] = to
            if cc:
                msg["Cc"] = cc
            if bcc:
                msg["Bcc"] = bcc
            msg["Subject"] = subject
            msg.attach(MIMEText(plain_body, "plain", "utf-8"))
            msg.attach(MIMEText(html_body, "html", "utf-8"))

        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        sent = service.users().messages().send(userId="me", body={"raw": raw}).execute()
        att_count = len(attachments) if attachments else 0
        att_names = ", ".join(a.get("filename", "file") for a in attachments) if attachments else ""
        att_note = f" with {att_count} attachment(s) ({att_names})" if att_count > 0 else ""
        return _record_email_action("send", {
            "success": True,
            "message": f"Email sent to {to}{att_note}" + (f" (Cc: {cc})" if cc else ""),
            "message_id": sent.get("id"),
            "thread_id": sent.get("threadId"),
            "attachments": [a.get("filename", "file") for a in attachments] if attachments else [],
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
    """Reply to an email thread with clean HTML and Plain multipart format."""
    try:
        service = get_gmail_service()
        plain_body = clean_email_body_plain(body)
        html_body = email_body_to_html(body)

        msg = MIMEMultipart("alternative")
        msg["To"] = to
        msg["Subject"] = f"Re: {subject}" if not subject.startswith("Re:") else subject
        msg["In-Reply-To"] = message_id
        msg["References"] = message_id
        msg.attach(MIMEText(plain_body, "plain", "utf-8"))
        msg.attach(MIMEText(html_body, "html", "utf-8"))
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


def draft_email(
    to: str,
    subject: str,
    body: str,
    cc: str = None,
    bcc: str = None,
    attachments: list[dict] | None = None,
) -> dict:
    """Save an email as a draft with optional attachments and clean HTML/Plain multipart format (does not send)."""
    try:
        service = get_gmail_service()
        plain_body = clean_email_body_plain(body)
        html_body = email_body_to_html(body)

        if attachments:
            msg = MIMEMultipart("mixed")
            msg["To"] = to
            if cc:
                msg["Cc"] = cc
            if bcc:
                msg["Bcc"] = bcc
            msg["Subject"] = subject

            alt_part = MIMEMultipart("alternative")
            alt_part.attach(MIMEText(plain_body, "plain", "utf-8"))
            alt_part.attach(MIMEText(html_body, "html", "utf-8"))
            msg.attach(alt_part)

            for att in attachments:
                fname = att.get("filename", "attachment")
                content = att.get("content", b"")
                if not content and att.get("path") and os.path.isfile(att["path"]):
                    try:
                        with open(att["path"], "rb") as af:
                            content = af.read()
                    except Exception as fe:
                        print(f"[email_tool] Failed to read draft attachment from {att['path']}: {fe}")

                ctype = att.get("content_type")
                if not ctype:
                    ctype, _ = mimetypes.guess_type(fname)
                if not ctype:
                    ctype = "application/octet-stream"

                maintype, subtype = ctype.split("/", 1) if "/" in ctype else ("application", "octet-stream")
                part = MIMEBase(maintype, subtype)
                part.set_payload(content)
                encoders.encode_base64(part)
                part.add_header("Content-Disposition", "attachment", filename=fname)
                msg.attach(part)
        else:
            msg = MIMEMultipart("alternative")
            msg["To"] = to
            if cc:
                msg["Cc"] = cc
            if bcc:
                msg["Bcc"] = bcc
            msg["Subject"] = subject
            msg.attach(MIMEText(plain_body, "plain", "utf-8"))
            msg.attach(MIMEText(html_body, "html", "utf-8"))

        raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
        draft = service.users().drafts().create(
            userId="me", body={"message": {"raw": raw}}
        ).execute()
        att_count = len(attachments) if attachments else 0
        att_names = ", ".join(a.get("filename", "file") for a in attachments) if attachments else ""
        att_note = f" with {att_count} attachment(s) ({att_names})" if att_count > 0 else ""
        return _record_email_action("draft", {
            "success": True,
            "draft_id": draft["id"],
            "message": f"Draft saved for {to}{att_note}" + (f" (Cc: {cc})" if cc else ""),
            "attachments": [a.get("filename", "file") for a in attachments] if attachments else [],
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
