from fastapi import FastAPI, Form, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from agent import generate_reply, needs_search
from tts import synthesize
from email_routes import router as email_router
from tools.pdf_tool import PDF_OUTPUT_DIR, save_uploaded_pdf
import base64
import httpx

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(email_router)
app.mount("/files", StaticFiles(directory=str(PDF_OUTPUT_DIR)), name="files")

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"


@app.get("/")
def root():
    return {"status": "VPA backend running"}


@app.post("/chat")
async def chat(req: ChatRequest):
    try:
        reply = await generate_reply(req.message, req.session_id)
        return {
            "reply": reply,
            "used_search": needs_search(req.message),
            "model": "Groq",
        }
    except Exception as exc:
        import traceback
        traceback.print_exc()
        return {
            "reply": f"Something went wrong: {exc}",
            "used_search": False,
            "model": "Groq",
        }


@app.post("/chat-voice")
async def chat_voice(req: ChatRequest):
    reply = await generate_reply(req.message, req.session_id)
    audio_bytes = synthesize(reply)
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    return {
        "reply": reply,
        "audio": audio_b64,
        "used_search": needs_search(req.message),
        "model": "Groq",
    }


@app.post("/chat-voice-input")
async def chat_voice_input(
    file: UploadFile = File(...),
    session_id: str = Form("default"),
):
    audio_bytes = await file.read()
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(
            "http://localhost:8001/transcribe",
            files={"audio": (file.filename, audio_bytes, file.content_type)},
        )
    transcript = res.json().get("transcript", "").strip()

    if not transcript:
        return {"reply": "I couldn't hear that clearly. Could you try again?", "audio": None}

    reply = await generate_reply(transcript, session_id)

    audio_bytes_out = synthesize(reply)
    audio_b64 = base64.b64encode(audio_bytes_out).decode("utf-8")

    return {
        "transcript": transcript,
        "reply": reply,
        "audio": audio_b64,
        "used_search": needs_search(transcript),
        "model": "Groq",
    }


@app.post("/chat-pdf")
async def chat_pdf(
    message: str = Form(...),
    session_id: str = Form("default"),
    file: UploadFile | None = File(None),
):
    try:
        pdf_path = None
        pdf_filename = None

        if file and file.filename:
            pdf_bytes = await file.read()
            saved = save_uploaded_pdf(file.filename, pdf_bytes)
            if not saved.get("success"):
                return {
                    "reply": saved.get("error", "I could not save that PDF."),
                    "used_search": False,
                    "model": "Groq",
                }
            pdf_path = saved["path"]
            pdf_filename = saved["filename"]

        reply = await generate_reply(
            message,
            session_id,
            pdf_path=pdf_path,
            pdf_filename=pdf_filename,
        )
        return {
            "reply": reply,
            "used_search": False,
            "model": "Groq",
        }
    except Exception as exc:
        import traceback
        traceback.print_exc()
        return {
            "reply": f"Something went wrong while processing the PDF: {exc}",
            "used_search": False,
            "model": "Groq",
        }
