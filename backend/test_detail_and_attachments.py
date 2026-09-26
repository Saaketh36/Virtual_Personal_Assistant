import asyncio
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from agent import (
    generate_reply,
    analyze_requested_detail,
    detect_attachment_intent,
    resolve_session_attachment,
    PENDING_EMAILS,
    SESSION_PDFS,
)
import tools.email_tool
from memory import delete_session
from tools.pdf_tool import create_topic_pdf, PDF_STORAGE_DIR

# Track mock email calls to verify actual payload attachments
LAST_EMAIL_CALL = {}

def mock_send_email(to, subject, body, cc=None, bcc=None, attachments=None, **kwargs):
    LAST_EMAIL_CALL["to"] = to
    LAST_EMAIL_CALL["subject"] = subject
    LAST_EMAIL_CALL["body"] = body
    LAST_EMAIL_CALL["attachments"] = attachments
    att_count = len(attachments) if attachments else 0
    att_names = ", ".join(a.get("filename", "file") for a in attachments) if attachments else ""
    att_note = f" with {att_count} attachment(s) ({att_names})" if att_count > 0 else ""
    return {
        "success": True,
        "message": f"Email sent to {to}{att_note}",
        "message_id": "mock_msg_999",
        "attachments": [a.get("filename", "file") for a in attachments] if attachments else [],
    }

tools.email_tool.send_email = mock_send_email
import agent
agent.send_email = mock_send_email


async def test_adaptive_detail_detection():
    print("\n--- 1. Testing Adaptive Detail Evaluation Unit ---")
    
    # Short / concise query
    res_short = analyze_requested_detail("Explain RAG in simple terms.")
    print(f"Short query mode: {res_short['mode']}, wants_concise={res_short['wants_concise']}")
    assert res_short["wants_concise"] is True, "Failed to identify concise intent for 'in simple terms'"

    # Another short query
    res_brief = analyze_requested_detail("Give me a brief summary of quantum computing in 2-3 lines")
    print(f"Brief query mode: {res_brief['mode']}, wants_concise={res_brief['wants_concise']}")
    assert res_brief["wants_concise"] is True, "Failed to identify concise intent for 'brief'"

    # Multi-topic comprehensive query
    res_detailed = analyze_requested_detail(
        "Explain RAG from basics, architecture, workflow, components, embeddings, vector databases, retrieval, generation, and give an example."
    )
    print(f"Detailed query mode: {res_detailed['mode']}, wants_detailed={res_detailed['wants_detailed']}")
    assert res_detailed["wants_detailed"] is True, "Failed to identify detailed intent for multi-topic RAG request"

    print("Adaptive detail unit checks passed!")


async def test_mention_vs_attach_intent():
    print("\n--- 2. Testing Mention vs Attach Intent Detection ---")
    
    # Merely mentioning
    att1, hint1 = detect_attachment_intent("Mention my resume in the email")
    print(f"'Mention my resume' -> wants_attachment={att1}, hint='{hint1}'")
    assert att1 is False, "Incorrectly flagged 'mention my resume' as attachment!"

    # Explicit attachment
    att2, hint2 = detect_attachment_intent("Attach my resume to the mail")
    print(f"'Attach my resume to the mail' -> wants_attachment={att2}, hint='{hint2}'")
    assert att2 is True and hint2 == "resume", "Failed to detect attach resume intent"

    # Both attaching AND mentioning
    att3, hint3 = detect_attachment_intent("Attach my resume and mention my AI/ML projects")
    print(f"'Attach my resume and mention my AI/ML projects' -> wants_attachment={att3}, hint='{hint3}'")
    assert att3 is True and hint3 == "resume", "Failed to detect attach intent when combined with mention"

    # Sending file
    att4, hint4 = detect_attachment_intent("Send this PDF in the email to boss@example.com")
    print(f"'Send this PDF in the email' -> wants_attachment={att4}, hint='{hint4}'")
    assert att4 is True, "Failed to detect 'send this PDF' as attachment intent"

    print("Mention vs attach unit checks passed!")


async def test_end_to_end():
    print("\n--- 3. Testing End-to-End LLM Generation & Email Attachments ---")
    session_id = "test_detail_session"
    await delete_session(session_id)
    PENDING_EMAILS.pop(session_id, None)
    SESSION_PDFS.pop(session_id, None)

    # 3a. Test Short LLM response
    print("\n[3a] Querying: 'Explain RAG in simple terms.'")
    short_reply = await generate_reply("Explain RAG in simple terms.", session_id=session_id)
    print(f"Short reply ({len(short_reply.split())} words):\n{short_reply}\n")
    word_count_short = len(short_reply.split())
    assert word_count_short < 250, f"Short answer was too long: {word_count_short} words"

    # 3b. Test Detailed LLM response
    print("\n[3b] Querying: 'Explain RAG from basics, architecture, workflow, components, embeddings, vector databases, retrieval, generation, and give an example.'")
    long_reply = await generate_reply(
        "Explain RAG from basics, architecture, workflow, components, embeddings, vector databases, retrieval, generation, and give an example.",
        session_id=session_id
    )
    print(f"Detailed reply ({len(long_reply.split())} words):\n{long_reply[:500]}...\n")
    word_count_long = len(long_reply.split())
    assert word_count_long >= 250, f"Detailed answer was not detailed enough: {word_count_long} words"
    assert word_count_long > word_count_short * 1.5, "Detailed response was not noticeably longer than short response"
    for term in ["retrieval", "generation", "embeddings"]:
        assert term in long_reply.lower(), f"Missing required term '{term}' in comprehensive RAG response"

    # 3c. Test missing file attachment error reporting
    print("\n[3c] Asking to attach a file when no file exists in session")
    missing_session = "empty_session_xyz"
    await delete_session(missing_session)
    PENDING_EMAILS.pop(missing_session, None)
    SESSION_PDFS.pop(missing_session, None)
    
    reply_missing = await generate_reply(
        "Send an email to recruiter@example.com, attach my portfolio, and mention my AI/ML projects.",
        session_id=missing_session
    )
    print(f"Missing file reply:\n{reply_missing}\n")
    assert "could not find" in reply_missing.lower() or "upload" in reply_missing.lower(), "Did not report missing file to user!"
    assert "attachment: portfolio" not in reply_missing.lower(), "Faked an attachment line instead of reporting missing file!"

    # Also test generic "attach this file" when nothing was uploaded
    reply_missing_generic = await generate_reply(
        "Draft an email to boss@example.com and attach this file",
        session_id=missing_session
    )
    print(f"Missing generic file reply:\n{reply_missing_generic}\n")
    assert "could not find" in reply_missing_generic.lower() or "upload" in reply_missing_generic.lower(), "Did not report missing file for generic attach request!"

    # 3d. Create a mock resume PDF and test real attachment + rich context incorporation
    print("\n[3d] Creating resume PDF and testing attachment + context incorporation")
    resume_info = create_topic_pdf(
        "Gundu Venkata Sri Sai Resume",
        "Education: B.Tech in CS (AI & ML) at Woxsen University with CGPA 8.33. "
        "Technical Skills: Python, TensorFlow, PyTorch, Scikit-learn, Transformers. "
        "Key Projects: Automated Drug Detection using NER with spaCy and BioBERT, Clinical Trial Analysis."
    )
    assert resume_info.get("success"), "Failed to create test resume PDF"
    resume_path = resume_info["path"]
    resume_name = resume_info["filename"]

    # Now upload the resume and draft email in one request
    reply_draft = await generate_reply(
        "Attach my resume and mention that it contains my academic background, technical skills, and AI/ML projects. Send to hr@company.com",
        session_id=session_id,
        pdf_path=resume_path,
        pdf_filename=resume_name
    )
    print(f"Draft reply:\n{reply_draft}\n")
    assert "📎" in reply_draft or "Attachment:" in reply_draft, "Draft preview did not show attachment card!"
    assert "hr@company.com" in reply_draft, "Recipient not in draft!"
    lowered_body = reply_draft.lower()
    # Check that it incorporated the user's requested details rather than a generic one-liner
    assert "academic" in lowered_body or "education" in lowered_body, "Did not incorporate academic background into email body!"
    assert "skill" in lowered_body or "python" in lowered_body, "Did not incorporate technical skills into email body!"
    assert "ai" in lowered_body or "ml" in lowered_body or "project" in lowered_body, "Did not incorporate AI/ML projects into email body!"
    assert "**" not in reply_draft.split("---")[1], "Email body contained markdown asterisks!"

    # 3e. Test sending the email and verifying actual payload attachment
    print("\n[3e] Approving email sending: 'send it'")
    reply_send = await generate_reply("send it", session_id=session_id)
    print(f"Send reply:\n{reply_send}\n")
    assert "successfully" in reply_send.lower(), "Send confirmation failed!"
    assert "attachment" in reply_send.lower(), "Send result did not mention attachment!"

    # Verify LAST_EMAIL_CALL payload had the actual attachment
    assert LAST_EMAIL_CALL.get("attachments"), "No attachments passed to send_email payload!"
    att_payload = LAST_EMAIL_CALL["attachments"][0]
    print(f"Attached file in payload: filename='{att_payload.get('filename')}', size={att_payload.get('size')} bytes")
    assert att_payload.get("size", 0) > 0, "Attachment payload was empty (0 bytes)!"
    assert att_payload.get("content"), "Attachment binary content missing!"

    # Clean up test resume
    if os.path.exists(resume_path):
        os.remove(resume_path)
    await delete_session(session_id)
    await delete_session(missing_session)


async def test_two_step_attachment_flow():
    print("\n--- 4. Testing Two-Step Attachment Update Flow ---")
    session_two_step = "test_two_step_session"
    await delete_session(session_two_step)
    PENDING_EMAILS.pop(session_two_step, None)
    SESSION_PDFS.pop(session_two_step, None)

    resume_info = create_topic_pdf(
        "Candidate Resume",
        "Candidate Details: Experienced AI Engineer specializing in NLP and Computer Vision."
    )
    assert resume_info.get("success")
    r_path = resume_info["path"]
    r_name = resume_info["filename"]

    try:
        # Step 1: Draft initial email without attachment
        print("\n[Step 1] Initial draft to team@example.com")
        reply_step1 = await generate_reply(
            "Draft an email to team@example.com for AI Engineer opening",
            session_id=session_two_step
        )
        print(f"Step 1 reply:\n{reply_step1}\n")
        assert "team@example.com" in reply_step1
        assert len(PENDING_EMAILS.get(session_two_step, [])) == 1
        assert not PENDING_EMAILS[session_two_step][0].get("attachments")

        # Step 2: Upload resume and say "Attach my resume and mention my AI projects"
        print("\n[Step 2] Updating pending email with attachment and mentioning AI projects")
        reply_step2 = await generate_reply(
            "Attach my resume and mention my AI projects",
            session_id=session_two_step,
            pdf_path=r_path,
            pdf_filename=r_name
        )
        print(f"Step 2 reply:\n{reply_step2}\n")
        assert "team@example.com" in reply_step2
        assert "📎" in reply_step2 or "Attachment:" in reply_step2
        assert len(PENDING_EMAILS.get(session_two_step, [])) == 1
        assert PENDING_EMAILS[session_two_step][0].get("attachments")
        att = PENDING_EMAILS[session_two_step][0]["attachments"][0]
        assert att.get("size", 0) > 0

        # Step 3: Approve and send
        print("\n[Step 3] Approving: 'send it'")
        reply_step3 = await generate_reply("send it", session_id=session_two_step)
        print(f"Step 3 reply:\n{reply_step3}\n")
        assert "successfully" in reply_step3.lower()
        assert LAST_EMAIL_CALL.get("attachments")
        assert LAST_EMAIL_CALL["to"] == "team@example.com"
        print("Two-step attachment update flow passed!")
    finally:
        if os.path.exists(r_path):
            os.remove(r_path)
        await delete_session(session_two_step)
        PENDING_EMAILS.pop(session_two_step, None)
        SESSION_PDFS.pop(session_two_step, None)

    print("\n=== ALL DETAIL & ATTACHMENT TESTS PASSED SUCCESSFULLY ===")


if __name__ == "__main__":
    asyncio.run(test_adaptive_detail_detection())
    asyncio.run(test_mention_vs_attach_intent())
    asyncio.run(test_end_to_end())
    asyncio.run(test_two_step_attachment_flow())
