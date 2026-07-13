import os
import re
import textwrap
import uuid
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
PDF_STORAGE_DIR = BASE_DIR / "storage" / "pdfs"
PDF_OUTPUT_DIR = BASE_DIR / "storage" / "generated"

PDF_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
PDF_OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def _fitz():
    try:
        import fitz
        return fitz
    except ImportError as exc:
        raise RuntimeError(
            "PyMuPDF is required for PDF services. Install backend requirements with: "
            "pip install -r backend/requirements.txt"
        ) from exc


def save_uploaded_pdf(filename: str, content: bytes) -> dict:
    if not filename.lower().endswith(".pdf"):
        return {"success": False, "error": "Please upload a PDF file."}

    safe_name = re.sub(r"[^A-Za-z0-9_.-]+", "_", filename).strip("._") or "document.pdf"
    stored_name = f"{uuid.uuid4().hex}_{safe_name}"
    path = PDF_STORAGE_DIR / stored_name
    path.write_bytes(content)
    return {"success": True, "path": str(path), "filename": safe_name}


def extract_pdf_text(pdf_path: str, max_chars: int = 30000) -> dict:
    try:
        fitz = _fitz()
        doc = fitz.open(pdf_path)
        pages = []
        total_chars = 0
        for index, page in enumerate(doc, start=1):
            text = page.get_text("text").strip()
            if not text:
                continue
            remaining = max_chars - total_chars
            if remaining <= 0:
                break
            chunk = text[:remaining]
            pages.append(f"Page {index}\n{chunk}")
            total_chars += len(chunk)

        return {
            "success": True,
            "text": "\n\n".join(pages).strip(),
            "page_count": doc.page_count,
            "truncated": total_chars >= max_chars,
        }
    except Exception as exc:
        return {"success": False, "error": str(exc)}



def _heading_level(text: str) -> int:
    stripped = text.strip()
    if re.match(r"^\d+(?:\.\d+)*\s+\S+", stripped):
        return stripped.count(".") + 1
    if stripped.isupper() and len(stripped) <= 80:
        return 1
    return 2


def _find_section_span(doc, section_title: str) -> dict | None:
    fitz = _fitz()
    target = re.sub(r"\s+", " ", section_title.strip()).lower()
    headings = []

    for page_index, page in enumerate(doc):
        blocks = page.get_text("dict").get("blocks", [])
        for block in blocks:
            for line in block.get("lines", []):
                line_text = " ".join(span.get("text", "") for span in line.get("spans", [])).strip()
                normalized = re.sub(r"\s+", " ", line_text).lower()
                if not line_text:
                    continue
                max_size = max((span.get("size", 0) for span in line.get("spans", [])), default=0)
                if max_size >= 12 or normalized == target or target in normalized:
                    headings.append({
                        "text": line_text,
                        "normalized": normalized,
                        "page": page_index,
                        "bbox": fitz.Rect(line["bbox"]),
                        "size": max_size,
                        "level": _heading_level(line_text),
                    })

    match_index = next(
        (i for i, heading in enumerate(headings) if heading["normalized"] == target or target in heading["normalized"]),
        None,
    )
    if match_index is None:
        return None

    start = headings[match_index]
    end = None
    for heading in headings[match_index + 1:]:
        if heading["level"] <= start["level"]:
            end = heading
            break

    return {"start": start, "end": end}


def modify_pdf_section(pdf_path: str, section_title: str, replacement_text: str) -> dict:
    try:
        fitz = _fitz()
        doc = fitz.open(pdf_path)
        span = _find_section_span(doc, section_title)
        if not span:
            return {
                "success": False,
                "error": f'I could not find a section titled "{section_title}" in that PDF.',
            }

        start = span["start"]
        end = span["end"]
        start_page = start["page"]
        end_page = end["page"] if end else doc.page_count - 1

        for page_index in range(start_page, end_page + 1):
            page = doc[page_index]
            page_rect = page.rect
            top = start["bbox"].y1 + 8 if page_index == start_page else 36
            bottom = end["bbox"].y0 - 8 if end and page_index == end_page else page_rect.y1 - 44
            if bottom <= top:
                continue
            redact_rect = fitz.Rect(42, top, page_rect.x1 - 42, bottom)
            page.add_redact_annot(redact_rect, fill=(1, 1, 1))
            page.apply_redactions()

        first_page = doc[start_page]
        write_rect = fitz.Rect(54, start["bbox"].y1 + 14, first_page.rect.x1 - 54, first_page.rect.y1 - 54)
        remaining = replacement_text.strip()
        if remaining:
            first_page.insert_textbox(
                write_rect,
                remaining,
                fontsize=11,
                fontname="helv",
                color=(0.12, 0.12, 0.14),
                lineheight=1.35,
            )

        source = Path(pdf_path)
        output_path = PDF_OUTPUT_DIR / f"{source.stem}_modified_{uuid.uuid4().hex[:8]}.pdf"
        doc.save(output_path)
        doc.close()
        return {
            "success": True,
            "path": str(output_path),
            "url": f"/files/{output_path.name}",
            "filename": output_path.name,
            "section": section_title,
        }
    except Exception as exc:
        return {"success": False, "error": str(exc)}


def _map_font_name(font_name: str) -> str:
    name = font_name.lower()
    if "helvetica" in name or "arial" in name or "sans" in name:
        if "bold" in name and "italic" in name:
            return "Helvetica-BoldOblique"
        if "bold" in name:
            return "Helvetica-Bold"
        if "italic" in name or "oblique" in name:
            return "Helvetica-Oblique"
        return "Helvetica"
    elif "times" in name or "roman" in name or "serif" in name:
        if "bold" in name and "italic" in name:
            return "Times-BoldItalic"
        if "bold" in name:
            return "Times-Bold"
        if "italic" in name:
            return "Times-Italic"
        return "Times-Roman"
    elif "courier" in name or "mono" in name:
        if "bold" in name and "italic" in name:
            return "Courier-BoldOblique"
        if "bold" in name:
            return "Courier-Bold"
        if "italic" in name:
            return "Courier-Oblique"
        return "Courier"
    return "Helvetica"


def _find_original_text_style(page, rect, find_text: str) -> dict:
    try:
        fitz = _fitz()
        text_dict = page.get_text("dict")
        best_span = None
        for block in text_dict.get("blocks", []):
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    span_bbox = fitz.Rect(span["bbox"])
                    if span_bbox.intersects(rect):
                        if find_text.lower() in span["text"].lower():
                            best_span = span
                            break
                        if best_span is None:
                            best_span = span
                if best_span and find_text.lower() in best_span["text"].lower():
                    break
            if best_span and find_text.lower() in best_span["text"].lower():
                break
        
        if best_span:
            col = best_span["color"]
            r = ((col >> 16) & 255) / 255.0
            g = ((col >> 8) & 255) / 255.0
            b = (col & 255) / 255.0
            return {
                "font": best_span["font"],
                "size": best_span["size"],
                "color": (r, g, b)
            }
    except Exception as e:
        print(f"Error finding original text style: {e}")
    
    return {
        "font": "Helvetica",
        "size": max(8, min(12, rect.height * 0.75)),
        "color": (0.12, 0.12, 0.14)
    }


def find_replace_in_pdf(pdf_path: str, find_text: str, replace_text: str) -> dict:
    """Find specific text in the PDF and replace it in-place, keeping the original style."""
    try:
        fitz = _fitz()
        doc = fitz.open(pdf_path)
        replacements_made = 0

        for page in doc:
            hits = page.search_for(find_text)
            if not hits:
                continue
            
            spans_to_replace = []
            replaced_span_keys = set()
            
            text_dict = page.get_text("dict")
            
            for rect in hits:
                best_span = None
                for block in text_dict.get("blocks", []):
                    for line in block.get("lines", []):
                        for span in line.get("spans", []):
                            span_bbox = fitz.Rect(span["bbox"])
                            if span_bbox.intersects(rect) and find_text.lower() in span["text"].lower():
                                best_span = span
                                break
                        if best_span:
                            break
                    if best_span:
                        break
                
                if best_span:
                    span_key = (best_span["bbox"][0], best_span["bbox"][1], best_span["bbox"][2], best_span["bbox"][3])
                    if span_key in replaced_span_keys:
                        continue
                    replaced_span_keys.add(span_key)
                    
                    spans_to_replace.append({
                        "rect": fitz.Rect(best_span["bbox"]),
                        "text": best_span["text"].replace(find_text, replace_text),
                        "font": _map_font_name(best_span["font"]),
                        "size": best_span["size"],
                        "color": best_span["color"],
                        "origin": best_span["origin"],
                        "occurrences": max(1, best_span["text"].lower().count(find_text.lower()))
                    })
                else:
                    spans_to_replace.append({
                        "rect": rect,
                        "text": replace_text,
                        "font": "Helvetica",
                        "size": max(8, min(12, rect.height * 0.75)),
                        "color": 2039588,  # Default dark gray
                        "occurrences": 1
                    })
            
            # Apply all redactions first
            for item in spans_to_replace:
                page.add_redact_annot(item["rect"], fill=(1, 1, 1))
            page.apply_redactions()
            
            # Insert all replaced text
            for item in spans_to_replace:
                rect = item["rect"]
                replace_str = item["text"]
                fontname = item["font"]
                fontsize = item["size"]
                
                col = item["color"]
                r = ((col >> 16) & 255) / 255.0
                g = ((col >> 8) & 255) / 255.0
                b = (col & 255) / 255.0
                
                origin_pt = item.get("origin")
                if not origin_pt:
                    origin_pt = (rect.x0, rect.y1 - rect.height * 0.15)
                
                page.insert_text(
                    origin_pt,
                    replace_str,
                    fontsize=fontsize,
                    fontname=fontname,
                    color=(r, g, b),
                )
                replacements_made += item["occurrences"]

        if replacements_made == 0:
            doc.close()
            return {
                "success": False,
                "error": f'I could not find "{find_text}" in the PDF.',
            }

        source = Path(pdf_path)
        output_path = PDF_OUTPUT_DIR / f"{source.stem}_modified_{uuid.uuid4().hex[:8]}.pdf"
        doc.save(output_path)
        doc.close()
        return {
            "success": True,
            "path": str(output_path),
            "url": f"/files/{output_path.name}",
            "filename": output_path.name,
            "replacements": replacements_made,
            "find": find_text,
            "replace": replace_text,
        }
    except Exception as exc:
        return {"success": False, "error": str(exc)}


# Newer generated-PDF renderer. It intentionally lives after the legacy renderer so
# existing imports keep the same function name while using the cleaner layout pass.
PDF_PAGE_MARGIN = 54
PDF_FOOTER_HEIGHT = 46
PDF_TITLE_COLOR = (0.08, 0.08, 0.1)
PDF_BODY_COLOR = (0.12, 0.12, 0.14)
PDF_MUTED_COLOR = (0.45, 0.45, 0.48)
PDF_ACCENT_COLOR = (0.75, 0.12, 0.18)
PDF_BULLET = chr(8226)


def _pdf_normalize_text(text: str) -> str:
    text = (text or "").replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("â€¢", PDF_BULLET)
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _pdf_plain_text(text: str) -> str:
    return text.replace("**", "")


def _pdf_inline_parts(text: str) -> list[tuple[str, bool]]:
    parts = []
    bold = False
    for part in text.split("**"):
        if part:
            parts.append((part, bold))
        bold = not bold
    return parts


def _pdf_inline_width(text: str, fontsize: int) -> float:
    fitz = _fitz()
    width = 0.0
    for part, bold in _pdf_inline_parts(text):
        fontname = "Helvetica-Bold" if bold else "Helvetica"
        width += fitz.get_text_length(part, fontname=fontname, fontsize=fontsize)
    return width


def _pdf_split_long_word(word: str, width: float, fontsize: int) -> list[str]:
    fitz = _fitz()
    chunks = []
    current = ""
    for char in word:
        candidate = current + char
        if current and fitz.get_text_length(_pdf_plain_text(candidate), fontname="Helvetica", fontsize=fontsize) > width:
            chunks.append(current)
            current = char
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks or [word]


def _pdf_wrap_inline_text(text: str, width: float, fontsize: int) -> list[str]:
    words = re.split(r"\s+", text.strip())
    lines = []
    current = ""

    for word in words:
        if not word:
            continue
        word_parts = [word]
        if _pdf_inline_width(word, fontsize) > width:
            word_parts = _pdf_split_long_word(word, width, fontsize)
        for word_part in word_parts:
            candidate = f"{current} {word_part}".strip()
            if current and _pdf_inline_width(candidate, fontsize) > width:
                lines.append(current)
                current = word_part
            else:
                current = candidate

    if current:
        lines.append(current)
    return lines


def _pdf_draw_inline_line(page, x: float, y: float, text: str, fontsize: int, color=PDF_BODY_COLOR):
    fitz = _fitz()
    for part, bold in _pdf_inline_parts(text):
        fontname = "Helvetica-Bold" if bold else "Helvetica"
        page.insert_text(
            fitz.Point(x, y),
            part,
            fontsize=fontsize,
            fontname=fontname,
            color=color,
        )
        x += fitz.get_text_length(part, fontname=fontname, fontsize=fontsize)


def _pdf_new_page(doc, title: str, page_width: float, page_height: float, margin: float, first: bool = False):
    fitz = _fitz()
    page = doc.new_page(width=page_width, height=page_height)
    if not first:
        page.insert_text(
            fitz.Point(margin, 34),
            title[:90],
            fontsize=9,
            fontname="Helvetica-Bold",
            color=PDF_MUTED_COLOR,
        )
        page.draw_line(
            fitz.Point(margin, 44),
            fitz.Point(page_width - margin, 44),
            color=(0.86, 0.86, 0.88),
            width=0.6,
        )
    return page


def _pdf_ensure_space(doc, page, y: float, needed: float, title: str, page_width: float, page_height: float, margin: float):
    if y + needed <= page_height - PDF_FOOTER_HEIGHT:
        return page, y
    page = _pdf_new_page(doc, title, page_width, page_height, margin)
    return page, margin + 10


def _pdf_is_heading(line: str) -> bool:
    text = line.strip()
    return bool(text.startswith("#") or (text.startswith("**") and text.endswith("**") and "\n" not in text))


def _pdf_clean_heading(line: str) -> str:
    text = re.sub(r"^#+\s*", "", line.strip())
    if text.startswith("**") and text.endswith("**"):
        text = text[2:-2]
    return text.strip()


def _pdf_body_blocks(body: str) -> list[dict]:
    blocks = []
    paragraph_lines = []

    def flush_paragraph():
        nonlocal paragraph_lines
        if paragraph_lines:
            blocks.append({"type": "paragraph", "text": " ".join(paragraph_lines).strip()})
            paragraph_lines = []

    for raw_line in _pdf_normalize_text(body).split("\n"):
        line = raw_line.strip()
        if not line:
            flush_paragraph()
            continue
        if _pdf_is_heading(line):
            flush_paragraph()
            blocks.append({"type": "heading", "text": _pdf_clean_heading(line)})
        elif re.match(r"^[*\-\u2022]\s+", line) or re.match(r"^\d+[.)]\s+", line):
            flush_paragraph()
            blocks.append({"type": "paragraph", "text": line})
        else:
            paragraph_lines.append(line)

    flush_paragraph()
    return blocks


def _pdf_draw_text_block(
    doc,
    page,
    title: str,
    text: str,
    x: float,
    y: float,
    width: float,
    page_width: float,
    page_height: float,
    margin: float,
    fontsize: int = 11,
    color=PDF_BODY_COLOR,
    prefix: str = "",
):
    fitz = _fitz()
    line_height = fontsize * 1.45
    prefix_width = 0.0
    if prefix:
        if prefix == f"{PDF_BULLET} ":
            prefix_width = 16
        else:
            prefix_width = fitz.get_text_length(prefix, fontname="Helvetica-Bold", fontsize=fontsize) + 8

    lines = _pdf_wrap_inline_text(text, max(24, width - prefix_width), fontsize) or [""]
    for index, line in enumerate(lines):
        page, y = _pdf_ensure_space(doc, page, y, line_height, title, page_width, page_height, margin)
        line_x = x + (prefix_width if prefix else 0)
        if index == 0 and prefix:
            if prefix == f"{PDF_BULLET} ":
                page.draw_circle(fitz.Point(x + 4, y - 4), 1.7, color=color, fill=color)
            else:
                page.insert_text(
                    fitz.Point(x, y),
                    prefix,
                    fontsize=fontsize,
                    fontname="Helvetica-Bold",
                    color=color,
                )
        _pdf_draw_inline_line(page, line_x, y, line, fontsize, color)
        y += line_height

    return page, y


def _pdf_draw_paragraph(doc, page, title: str, text: str, x: float, y: float, width: float, page_width: float, page_height: float, margin: float):
    text = text.strip()
    prefix = ""
    bullet_match = re.match(r"^[*\-\u2022]\s+(.*)$", text)
    number_match = re.match(r"^(\d+[.)])\s+(.*)$", text)

    if bullet_match:
        prefix = f"{PDF_BULLET} "
        text = bullet_match.group(1).strip()
    elif number_match:
        prefix = f"{number_match.group(1)} "
        text = number_match.group(2).strip()

    return _pdf_draw_text_block(
        doc,
        page,
        title,
        text,
        x,
        y,
        width,
        page_width,
        page_height,
        margin,
        fontsize=11,
        color=PDF_BODY_COLOR,
        prefix=prefix,
    )


def validate_pdf_file(pdf_path: str) -> dict:
    try:
        fitz = _fitz()
        path = Path(pdf_path)
        if not path.exists() or path.stat().st_size == 0:
            return {"success": False, "error": "The PDF file was not written correctly."}
        doc = fitz.open(pdf_path)
        page_count = doc.page_count
        doc.close()
        if page_count < 1:
            return {"success": False, "error": "The PDF has no pages."}
        return {"success": True, "page_count": page_count, "size": path.stat().st_size}
    except Exception as exc:
        return {"success": False, "error": f"The PDF could not be validated: {exc}"}


def create_topic_pdf(topic: str, body: str) -> dict:
    fitz = _fitz()
    title = _pdf_normalize_text(topic) or "Generated Report"
    safe_title = re.sub(r"[^A-Za-z0-9_.-]+", "_", title).strip("._")[:80] or "report"
    output_path = PDF_OUTPUT_DIR / f"{safe_title}_{uuid.uuid4().hex[:8]}.pdf"

    doc = fitz.open()
    margin = PDF_PAGE_MARGIN
    page_width, page_height = fitz.paper_size("a4")
    page = _pdf_new_page(doc, title, page_width, page_height, margin, first=True)

    y = 62
    for line in _pdf_wrap_inline_text(title, page_width - 2 * margin, 22) or [title]:
        page.insert_text(
            fitz.Point(margin, y),
            line,
            fontsize=22,
            fontname="Helvetica-Bold",
            color=PDF_TITLE_COLOR,
        )
        y += 29

    page.draw_line(
        fitz.Point(margin, y - 9),
        fitz.Point(page_width - margin, y - 9),
        color=PDF_ACCENT_COLOR,
        width=1.2,
    )
    y += 20

    for block in _pdf_body_blocks(body):
        if block["type"] == "heading":
            heading = block["text"]
            fontsize = 14
            line_height = fontsize * 1.45
            lines = _pdf_wrap_inline_text(heading, page_width - 2 * margin, fontsize) or [heading]
            page, y = _pdf_ensure_space(
                doc,
                page,
                y + 6,
                len(lines) * line_height + 8,
                title,
                page_width,
                page_height,
                margin,
            )
            for line in lines:
                page.insert_text(
                    fitz.Point(margin, y),
                    line,
                    fontsize=fontsize,
                    fontname="Helvetica-Bold",
                    color=PDF_TITLE_COLOR,
                )
                y += line_height
            y += 4
        else:
            page, y = _pdf_draw_paragraph(
                doc,
                page,
                title,
                block["text"],
                margin,
                y,
                page_width - 2 * margin,
                page_width,
                page_height,
                margin,
            )
            y += 8

    for page_number, rendered_page in enumerate(doc, start=1):
        footer = f"Page {page_number} of {doc.page_count}"
        rendered_page.insert_text(
            fitz.Point(page_width - margin - 70, page_height - 32),
            footer,
            fontsize=9,
            fontname="Helvetica",
            color=PDF_MUTED_COLOR,
        )

    doc.set_metadata({
        "title": title,
        "author": "Virtual Assist",
        "subject": "Generated PDF",
        "creator": "Virtual Assist PDF Generator",
    })
    doc.save(output_path, garbage=4, deflate=True)
    doc.close()

    validation = validate_pdf_file(str(output_path))
    if not validation.get("success"):
        return validation
    return {
        "success": True,
        "path": str(output_path),
        "url": f"/files/{output_path.name}",
        "filename": output_path.name,
    }
