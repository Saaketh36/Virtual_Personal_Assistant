import os
import re
import json
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
)
from tools.pdf_tool import create_topic_pdf, extract_pdf_text, modify_pdf_section, find_replace_in_pdf
from memory import get_relevant_context, get_recent_context, save_conversation, count_raw_turns, summarize_old_turns

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY")
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
GROQ_CODE_MODEL = os.getenv("GROQ_CODE_MODEL", "llama-3.1-8b-instant")

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
    "compose email", "draft email", "draft an email",
    "read email", "check email", "check my email", "open email",
    "inbox", "unread", "my emails", "new emails",
    "reply to", "reply to email", "respond to email",
    "search email", "find email", "emails from", "email from",
    "forward email",
]

PDF_KEYWORDS = [
    "pdf", "document", "extract text", "summarize pdf", "summarise pdf",
    "make a pdf", "create a pdf", "generate a pdf", "modify pdf",
    "update section", "replace section", "change section",
    "create pdf", "make pdf", "generate pdf", "write pdf",
]

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
PENDING_EMAILS: dict[str, dict] = {}
SESSION_PDFS: dict[str, dict] = {}

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
    if bool(pdf_path) or any(k in text for k in PDF_KEYWORDS):
        return True
    if session_id and session_id in SESSION_PDFS:
        if any(k in text for k in PDF_FOLLOWUP_KEYWORDS):
            return True
    return False


def is_vague_followup(user_text: str) -> bool:
    text = user_text.strip().lower()
    words = re.findall(r"\w+", text)
    followup_markers = [
        "it", "this", "that", "same", "again", "instead", "previous",
        "above", "last", "dont", "don't", "make it", "give me",
    ]
    return len(words) <= 12 or any(marker in text for marker in followup_markers)


def is_pdf_style_followup(user_text: str, session_id: str) -> bool:
    text = user_text.lower()
    return session_id in SESSION_PDFS and any(k in text for k in PDF_STYLE_KEYWORDS)


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

    emails = EMAIL_ADDRESS_RE.findall(text)
    if not emails:
        return {
            "error": "I need the recipient's email address before I can send it.",
        }

    to_email = emails[0]
    cc_email = None
    bcc_email = None

    # Check for CC/BCC patterns in the text
    cc_match = re.search(r"cc\s*[:\-]?\s*([\w.+-]+@[\w-]+(?:\.[\w-]+)+)", lowered)
    if cc_match:
        cc_email = cc_match.group(1)
    elif len(emails) > 1:
        for email in emails[1:]:
            pos = lowered.find(email)
            prefix = lowered[max(0, pos-25):pos]
            if "cc" in prefix or "copy" in prefix:
                cc_email = email
                break
        if not cc_email:
            cc_email = emails[1]

    # Similar for BCC
    bcc_match = re.search(r"bcc\s*[:\-]?\s*([\w.+-]+@[\w-]+(?:\.[\w-]+)+)", lowered)
    if bcc_match:
        bcc_email = bcc_match.group(1)
    elif len(emails) > 2 and not bcc_email:
        for email in emails[1:]:
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

    after_email = text[EMAIL_ADDRESS_RE.search(text).end():].strip(" .,\n\t")
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
        "to": to_email,
        "cc": cc_email,
        "bcc": bcc_email,
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
    cc_line = f"Cc: {email_request['cc']}\n" if email_request.get("cc") else ""
    bcc_line = f"Bcc: {email_request['bcc']}\n" if email_request.get("bcc") else ""
    return (
        f"Here is the email I prepared. Should I {action}?\n\n"
        f"To: {email_request['to']}\n"
        f"{cc_line}"
        f"{bcc_line}"
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


def _parse_find_replace(user_text: str) -> dict | None:
    # Pattern 1: change/replace [something] from/to <val1> to/with <val2>
    match1 = re.search(
        r"(?:change|replace|update)\s+(?:.+?\s+)?(?:from|to)\s+[\"']?(.+?)[\"']?\s+(?:to|with)\s+[\"']?(.+?)[\"']?(?:$|\s|in\s|on\s|with\s)",
        user_text,
        re.IGNORECASE | re.DOTALL
    )
    if match1:
        val1 = match1.group(1).strip(" .\"'")
        val2 = match1.group(2).strip(" .\"'")
        if val1 and val2:
            return {"find": val1, "replace": val2}

    # Pattern 2: change/replace <val1> to/with <val2>
    match2 = re.search(
        r"(?:change|replace|update)\s+[\"']?(.+?)[\"']?\s+(?:to|with)\s+[\"']?(.+?)[\"']?(?:$|\s|in\s|on\s)",
        user_text,
        re.IGNORECASE | re.DOTALL
    )
    if match2:
        val1 = match2.group(1).strip(" .\"'")
        val2 = match2.group(2).strip(" .\"'")
        if val1 and val2:
            return {"find": val1, "replace": val2}

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
    has_create_trigger = any(k in text for k in ["make a pdf", "create a pdf", "generate a pdf", "write a pdf", "make pdf", "create pdf", "generate pdf", "write pdf"])
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
            SESSION_PDFS[session_id] = {
                "path": result["path"],
                "filename": result["filename"],
                "topic": topic,
            }
            return f"I created a neat PDF about {topic}.\n{_download_line(result)}"
        else:
            writer_prompt = (
                "Create clean, well-structured PDF content for the requested topic.\n"
                "Use a short title, clear section headings, concise paragraphs, and practical bullet points.\n"
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
            SESSION_PDFS[session_id] = {
                "path": result["path"],
                "filename": result["filename"],
                "topic": topic,
            }
            return f"I created a neat PDF about {topic}.\n{_download_line(result)}"

    remembered = SESSION_PDFS.get(session_id)

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

        SESSION_PDFS[session_id] = {
            "path": result["path"],
            "filename": result["filename"],
            "topic": topic,
        }
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

        SESSION_PDFS[session_id] = {
            "path": result["path"],
            "filename": result["filename"],
            "topic": topic,
        }
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

        SESSION_PDFS[session_id] = {
            "path": result["path"],
            "filename": result["filename"],
            "topic": topic,
        }
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
                SESSION_PDFS[session_id] = {"path": result["path"], "filename": result["filename"]}
                return (
                    f"I replaced \"{find_replace['find']}\" with \"{find_replace['replace']}\" in {pdf_filename or 'the PDF'} "
                    f"and preserved the rest of the document.\n{_download_line(result)}"
                )
            
            # Direct match failed, attempt LLM resolution fallback
            if pdf_text:
                resolved = await resolve_find_replace_with_llm(user_text, pdf_text)
                if resolved:
                    result = find_replace_in_pdf(pdf_path, resolved["find"], resolved["replace"])
                    if result.get("success"):
                        SESSION_PDFS[session_id] = {"path": result["path"], "filename": result["filename"]}
                        return (
                            f"I replaced \"{resolved['find']}\" with \"{resolved['replace']}\" in {pdf_filename or 'the PDF'} "
                            f"and preserved the rest of the document.\n{_download_line(result)}"
                        )

        elif pdf_text:
            resolved = await resolve_find_replace_with_llm(user_text, pdf_text)
            if resolved:
                result = find_replace_in_pdf(pdf_path, resolved["find"], resolved["replace"])
                if result.get("success"):
                    SESSION_PDFS[session_id] = {"path": result["path"], "filename": result["filename"]}
                    return (
                        f"I replaced \"{resolved['find']}\" with \"{resolved['replace']}\" in {pdf_filename or 'the PDF'} "
                        f"and preserved the rest of the document.\n{_download_line(result)}"
                    )

        parsed = _parse_section_edit(user_text)
        if parsed["section"] and parsed["replacement"]:
            result = modify_pdf_section(pdf_path, parsed["section"], parsed["replacement"])
            if result.get("success"):
                SESSION_PDFS[session_id] = {"path": result["path"], "filename": result["filename"]}
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
        summary_prompt = (
            "Summarize this PDF clearly and concisely. Include the main points, important details, "
            "and any action items or conclusions if present.\n\n"
            f"PDF: {pdf_filename or 'uploaded document'}\n"
            f"Pages: {extraction['page_count']}\n\n"
            f"{extraction['text']}"
        )
        summary = await summarizer.arun(summary_prompt)
        note = "\n\nNote: I summarized the first extracted portion because the PDF is long." if extraction.get("truncated") else ""
        return f"Here is the summary of {pdf_filename or 'the PDF'}:\n\n{summary.content.strip()}{note}"

    extracted = extraction["text"]
    if extraction.get("truncated"):
        extracted += "\n\n[Text was truncated because the PDF is long.]"
    return f"Extracted text from {pdf_filename or 'the PDF'}:\n\n{extracted}"


async def generate_reply(
    user_text: str,
    session_id: str,
    pdf_path: str | None = None,
    pdf_filename: str | None = None,
) -> str:
    from tools.web_search import web_search_called
    web_search_called.set(False)
    email_last_action.set(None)

    # Remember the uploaded PDF for follow-up commands
    if pdf_path:
        SESSION_PDFS[session_id] = {"path": pdf_path, "filename": pdf_filename}

    # 1. Retrieve context. Recent turns preserve continuity; vector memory is background.
    recent_context = await get_recent_context(session_id)
    if is_vague_followup(user_text):
        long_term_context = ""
    else:
        long_term_context = await get_relevant_context(
            user_text,
            session_id,
            include_summaries=True,
        )
    context_parts = []
    if recent_context:
        context_parts.append(f"Recent conversation:\n{recent_context}")
    if long_term_context:
        context_parts.append(f"Relevant long-term memory:\n{long_term_context}")
    context = "\n\n".join(context_parts)

    if needs_pdf(user_text, pdf_path, session_id) or is_pdf_style_followup(user_text, session_id):
        reply = await handle_pdf_request(user_text, session_id, context, pdf_path, pdf_filename)
        await save_conversation(user_text, reply, session_id)
        return reply

    pending_email = PENDING_EMAILS.get(session_id)
    if pending_email:
        user_approval_text = user_text.lower()
        is_approved_msg = is_approval(user_text) or any(k in user_approval_text for k in ["save", "draft", "keep"])
        if is_approved_msg:
            is_draft_confirm = any(k in user_approval_text for k in ["draft", "save", "keep", "dont send", "don't send"])
            is_send_confirm = any(k in user_approval_text for k in ["send", "go ahead", "approve", "mail it"])
            
            final_action = pending_email["action"]
            if is_send_confirm and not is_draft_confirm:
                final_action = "send"
            elif is_draft_confirm and not is_send_confirm:
                final_action = "draft"

            if final_action == "draft":
                result = draft_email(
                    pending_email["to"],
                    pending_email["subject"],
                    pending_email["body"],
                    cc=pending_email.get("cc"),
                    bcc=pending_email.get("bcc"),
                )
                reply = format_email_action_result("draft", result)
            else:
                result = send_email(
                    pending_email["to"],
                    pending_email["subject"],
                    pending_email["body"],
                    cc=pending_email.get("cc"),
                    bcc=pending_email.get("bcc"),
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
        "2. Be concise and direct.\n"
        "3. Use recent conversation to resolve follow-up messages like 'it', 'this', "
        "'same', or formatting changes.\n"
        "4. Treat long-term memory as background only; do not summarize or discuss it "
        "unless the user asks about previous conversation.\n\n"
    )
    if context:
        system_message += f"Context:\n{context}\n"

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
