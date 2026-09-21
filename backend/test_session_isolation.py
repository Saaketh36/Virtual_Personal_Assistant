import asyncio
import os
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

# Ensure backend directory is in the path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from agent import generate_reply, PENDING_EMAILS, SESSION_PDFS
import tools.email_tool
from memory import delete_session, get_session_documents
from tools.pdf_tool import create_topic_pdf

# Mock send_email so test verifies reference routing without requiring live Gmail token
tools.email_tool.send_email = lambda to, subject, body, cc=None, bcc=None: {
    "success": True,
    "message": f"Email sent to {to} with subject '{subject}'",
    "message_id": "test_msg_id_123",
}
import agent
agent.send_email = tools.email_tool.send_email


async def run_tests():
    print("=== STARTING MEMORY & REFERENCE TESTS ===")

    session_a = "test_ref_session_A"
    await delete_session(session_a)
    if session_a in PENDING_EMAILS:
        PENDING_EMAILS.pop(session_a)
    if session_a in SESSION_PDFS:
        SESSION_PDFS.pop(session_a)

    print("Creating distinct test PDFs...")
    pdf_a_info = create_topic_pdf(
        "Outing Plan", 
        "Outing Plan Details: The team outing is on Saturday at Central Park starting at 2:00 PM. We will have picnic food like sandwiches, cookies, and soda."
    )
    pdf_b_info = create_topic_pdf(
        "Deep Learning Tips", 
        "Deep Learning Tips: PyTorch is a framework. Gradient descent is used for optimization. Transformers use self-attention to process input sequences in parallel."
    )

    if not pdf_a_info.get("success") or not pdf_b_info.get("success"):
        print("Failed to create test PDFs.")
        return

    path_a = pdf_a_info["path"]
    name_a = pdf_a_info["filename"]
    path_b = pdf_b_info["path"]
    name_b = pdf_b_info["filename"]

    try:
        # 1. Upload PDF A and draft Email A
        print("\n--- 1. Uploading PDF A & drafting Email A ---")
        reply1 = await generate_reply(
            "Summarize this document and draft a mail to saaketh.306@gmail.com about this document",
            session_id=session_a,
            pdf_path=path_a,
            pdf_filename=name_a
        )
        print(f"Reply 1:\n{reply1}\n")
        assert "outing" in reply1.lower() or "park" in reply1.lower(), "Email A did not capture PDF A context!"

        # 2. Upload PDF B and draft Email B
        print("\n--- 2. Uploading PDF B & drafting Email B ---")
        reply2 = await generate_reply(
            "Summarize this document and draft a mail to saaketh.306@gmail.com about this document",
            session_id=session_a,
            pdf_path=path_b,
            pdf_filename=name_b
        )
        print(f"Reply 2:\n{reply2}\n")
        assert "pytorch" in reply2.lower() or "transformers" in reply2.lower(), "Email B did not capture PDF B context!"

        # 3. Draft Email C (general message, no PDF upload)
        print("\n--- 3. Drafting Email C (General Greeting) ---")
        reply3 = await generate_reply(
            "draft a mail to saaketh.306@gmail.com saying Hello Saaketh",
            session_id=session_a
        )
        print(f"Reply 3:\n{reply3}\n")

        # Verify we have 3 pending emails in the list
        pending = PENDING_EMAILS.get(session_a, [])
        print(f"Pending emails list length: {len(pending)}")
        assert len(pending) == 3, f"Expected 3 pending emails, got {len(pending)}"

        # 4. Test "send the first mail"
        print("\n--- 4. Sending the first mail (should be Email A - Outing) ---")
        reply_send1 = await generate_reply(
            "send the first mail",
            session_id=session_a
        )
        print(f"Reply Send 1:\n{reply_send1}\n")
        assert "outing" in reply_send1.lower() or "park" in reply_send1.lower() or "sent" in reply_send1.lower(), "First mail send failed or selected wrong email!"
        
        # Verify length is now 2
        pending = PENDING_EMAILS.get(session_a, [])
        assert len(pending) == 2, f"Expected 2 pending emails remaining, got {len(pending)}"

        # 5. Test "send the mail before that one" (relative to the remaining list: [Email B, Email C])
        # The remaining list is:
        # Index 0: Email B (Deep Learning Tips)
        # Index 1: Email C (General Greeting)
        # "mail before that one" (relative to index 1) is Index 0 (Email B)
        print("\n--- 5. Sending the mail before that one (should be Email B - Deep Learning) ---")
        reply_send2 = await generate_reply(
            "send the mail before that one",
            session_id=session_a
        )
        print(f"Reply Send 2:\n{reply_send2}\n")
        assert "pytorch" in reply_send2.lower() or "transformers" in reply_send2.lower() or "sent" in reply_send2.lower(), "Relative mail send failed or selected wrong email!"

        # Verify length is now 1
        pending = PENDING_EMAILS.get(session_a, [])
        assert len(pending) == 1, f"Expected 1 pending email remaining, got {len(pending)}"

        # 6. Test PDF reference history: "previous pdf"
        # We uploaded PDF A first, then PDF B.
        # So SESSION_PDFS has: [PDF A, PDF B].
        # "previous pdf" should refer to PDF A (Outing Plan).
        print("\n--- 6. Testing 'previous pdf' reference ---")
        reply_pdf1 = await generate_reply(
            "summarize previous pdf and make a separate pdf on that one",
            session_id=session_a
        )
        print(f"Reply PDF 1:\n{reply_pdf1}\n")
        assert "outing" in reply_pdf1.lower() or "park" in reply_pdf1.lower() or "created" in reply_pdf1.lower(), "Failed to reference previous PDF (Outing Plan)!"

        print("\n=== ALL MEMORY & REFERENCE TESTS PASSED SUCCESSFULLY ===")

    finally:
        # Clean up files
        if os.path.exists(path_a):
            os.remove(path_a)
        if os.path.exists(path_b):
            os.remove(path_b)
        # Clean up session
        await delete_session(session_a)
        if session_a in PENDING_EMAILS:
            PENDING_EMAILS.pop(session_a)
        if session_a in SESSION_PDFS:
            SESSION_PDFS.pop(session_a)
        print("Cleaned up temporary test files and sessions.")


if __name__ == "__main__":
    asyncio.run(run_tests())
