"""
FastAPI router for Gmail email operations.
Endpoints used by the frontend EmailPanel.
"""

import asyncio
from fastapi import APIRouter, HTTPException, Query, Request, UploadFile, File, Form
from pydantic import BaseModel
from gmail_auth import is_authenticated, start_oauth_flow
from tools.email_tool import (
    read_inbox, get_email_detail, search_emails,
    send_email, reply_to_email, draft_email,
    mark_as_read, get_unread_count,
)

router = APIRouter(prefix="/email", tags=["email"])


# ── Status ─────────────────────────────────────────────────────────────────────

@router.get("/status")
def email_status():
    """Check if Gmail is authenticated and return account details."""
    authenticated = is_authenticated()
    if not authenticated:
        return {"authenticated": False, "unread_count": 0, "email": None, "total_messages": 0}

    unread = get_unread_count()
    email_address = None
    total_messages = 0
    try:
        from gmail_auth import get_gmail_service
        service = get_gmail_service()
        profile = service.users().getProfile(userId="me").execute()
        email_address = profile.get("emailAddress")
        total_messages = profile.get("messagesTotal", 0)
    except Exception as e:
        print(f"[email/status profile fetch error] {e}")

    return {
        "authenticated": True,
        "email": email_address,
        "unread_count": unread,
        "total_messages": total_messages,
    }


@router.get("/auth")
def email_auth():
    """
    Start OAuth2 and return the Google consent URL.
    """
    try:
        return {"auth_url": start_oauth_flow()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Inbox ──────────────────────────────────────────────────────────────────────

@router.get("/inbox")
async def get_inbox(limit: int = Query(default=15, ge=1, le=50)):
    """Fetch latest emails from inbox for the EmailPanel UI."""
    if not is_authenticated():
        raise HTTPException(status_code=401, detail="Gmail not authenticated. Call /email/auth first.")
    emails = await asyncio.to_thread(read_inbox, limit)
    return {"emails": emails}


@router.get("/sent")
async def get_sent(limit: int = Query(default=10, ge=1, le=50)):
    """Fetch recent sent emails for verification/debugging."""
    if not is_authenticated():
        raise HTTPException(status_code=401, detail="Gmail not authenticated.")
    emails = await asyncio.to_thread(search_emails, "in:sent", limit)
    return {"emails": emails}


@router.get("/message/{message_id}")
async def get_message(message_id: str):
    """Get full content of a specific email."""
    if not is_authenticated():
        raise HTTPException(status_code=401, detail="Gmail not authenticated.")
    email = await asyncio.to_thread(get_email_detail, message_id)
    if "error" in email:
        raise HTTPException(status_code=404, detail=email["error"])
    return email


@router.post("/message/{message_id}/read")
async def mark_read(message_id: str):
    """Mark an email as read."""
    if not is_authenticated():
        raise HTTPException(status_code=401, detail="Gmail not authenticated.")
    result = await asyncio.to_thread(mark_as_read, message_id)
    return result


# ── Search ─────────────────────────────────────────────────────────────────────

@router.get("/search")
async def search(q: str = Query(..., description="Gmail search query"), limit: int = 10):
    """Search emails using Gmail query syntax."""
    if not is_authenticated():
        raise HTTPException(status_code=401, detail="Gmail not authenticated.")
    emails = await asyncio.to_thread(search_emails, q, limit)
    return {"emails": emails, "query": q}


# ── Send / Reply / Draft ───────────────────────────────────────────────────────

class SendRequest(BaseModel):
    to: str
    subject: str
    body: str


class ReplyRequest(BaseModel):
    thread_id: str
    message_id: str
    to: str
    subject: str
    body: str


class DraftRequest(BaseModel):
    to: str
    subject: str
    body: str


@router.post("/send")
async def send(
    request: Request,
    to: str = Form(None),
    subject: str = Form(None),
    body: str = Form(None),
    files: list[UploadFile] = File(None),
):
    """Send an email with optional file attachments. Supports both multipart/form-data and JSON."""
    if not is_authenticated():
        raise HTTPException(status_code=401, detail="Gmail not authenticated.")

    content_type = request.headers.get("content-type", "")
    to_val = to
    subject_val = subject
    body_val = body
    attachment_list = []

    if "application/json" in content_type:
        try:
            data = await request.json()
            to_val = data.get("to")
            subject_val = data.get("subject")
            body_val = data.get("body")
        except Exception:
            pass
    elif files:
        total_size = 0
        MAX_TOTAL_SIZE = 25 * 1024 * 1024  # 25MB Gmail limit
        for f in files:
            if f and f.filename:
                file_bytes = await f.read()
                total_size += len(file_bytes)
                if total_size > MAX_TOTAL_SIZE:
                    raise HTTPException(
                        status_code=400,
                        detail="Total attachment size exceeds the 25MB Gmail limit.",
                    )
                attachment_list.append({
                    "filename": f.filename,
                    "content": file_bytes,
                    "content_type": f.content_type,
                })

    if not to_val or not subject_val or body_val is None:
        raise HTTPException(status_code=422, detail="Missing required fields: to, subject, body.")

    result = await asyncio.to_thread(
        send_email,
        to_val,
        subject_val,
        body_val,
        attachments=attachment_list if attachment_list else None,
    )
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Send failed"))
    return result


@router.post("/reply")
async def reply(req: ReplyRequest):
    """Reply to an email thread."""
    if not is_authenticated():
        raise HTTPException(status_code=401, detail="Gmail not authenticated.")
    result = await asyncio.to_thread(
        reply_to_email, req.thread_id, req.message_id, req.to, req.subject, req.body
    )
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Reply failed"))
    return result


@router.post("/draft")
async def draft(req: DraftRequest):
    """Save an email as a draft."""
    if not is_authenticated():
        raise HTTPException(status_code=401, detail="Gmail not authenticated.")
    result = await asyncio.to_thread(draft_email, req.to, req.subject, req.body)
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Draft failed"))
    return result
