from fastapi import FastAPI, Form, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from agent import generate_reply, needs_search
from tts import synthesize
from email_routes import router as email_router
from tools.pdf_tool import PDF_OUTPUT_DIR, save_uploaded_pdf
from memory import list_sessions, get_session_messages, delete_session
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

import os
from groq import Groq

WHISPER_SILENCE_HALLUCINATIONS = {
    "thank you.", "thank you", "thank you very much.", "thank you very much",
    "thanks for watching.", "thanks for watching!", "thanks for watching",
    "please subscribe.", "subscribe to my channel.", "subtitles by",
    "you", "thank you. thank you.", "thank you. thank you. thank you.",
    "bye.", "bye", "goodbye.", "goodbye", "okay.", "okay"
}

def clean_whisper_transcript(text: str) -> str:
    cleaned = (text or "").strip()
    lowered = cleaned.lower().strip(" .!?,")
    if lowered in WHISPER_SILENCE_HALLUCINATIONS or not lowered:
        return ""
    words = lowered.split()
    if len(words) >= 2 and all(w == words[0] for w in words):
        if words[0] in ["thank", "you", "thanks", "bye"]:
            return ""
    return cleaned

def transcribe_audio_bytes(audio_bytes: bytes, filename: str = "audio.webm") -> str:
    """Transcribe audio bytes using Groq Whisper API (whisper-large-v3-turbo)."""
    print(f"[transcribe] Received audio: {len(audio_bytes)} bytes, filename: {filename}")
    if not audio_bytes or len(audio_bytes) < 100:
        print("[transcribe] Audio bytes too small or empty")
        return ""
    groq_api_key = os.getenv("GROQ_API_KEY")
    if groq_api_key:
        try:
            client = Groq(api_key=groq_api_key)
            ext = os.path.splitext(filename or "")[1].lower()
            if ext not in [".webm", ".wav", ".mp3", ".m4a", ".ogg", ".mp4"]:
                ext = ".webm"
            res = client.audio.transcriptions.create(
                file=(f"audio{ext}", audio_bytes),
                model="whisper-large-v3-turbo",
                response_format="json",
            )
            raw_text = (res.text or "").strip()
            print(f"[transcribe] Whisper raw output: '{raw_text}'")
            cleaned = clean_whisper_transcript(raw_text)
            print(f"[transcribe] Whisper cleaned output: '{cleaned}'")
            return cleaned
        except Exception as exc:
            print(f"[Groq Whisper transcription error] {type(exc).__name__}: {exc}")
    else:
        print("[transcribe] GROQ_API_KEY is missing!")
    return ""

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"
    enable_web: bool | None = None


@app.get("/")
def root():
    return {"status": "VPA backend running"}


@app.get("/sessions")
async def sessions_list():
    """Return all distinct sessions from the database."""
    try:
        sessions = await list_sessions()
        return {"sessions": sessions}
    except Exception:
        return {"sessions": []}


@app.get("/sessions/{session_id}/messages")
async def session_messages(session_id: str):
    """Return the ordered chat history for a session."""
    try:
        messages = await get_session_messages(session_id)
        return {"messages": messages}
    except Exception:
        return {"messages": []}


@app.delete("/sessions/{session_id}")
async def session_delete(session_id: str):
    """Delete all data for a session."""
    try:
        ok = await delete_session(session_id)
        try:
            from agent import SESSION_PDFS, PENDING_EMAILS
            SESSION_PDFS.pop(session_id, None)
            PENDING_EMAILS.pop(session_id, None)
        except Exception as e:
            print(f"Failed to clear in-memory state: {e}")
        return {"success": ok}
    except Exception:
        return {"success": False}


@app.post("/chat")
async def chat(req: ChatRequest):
    try:
        reply = await generate_reply(req.message, req.session_id, enable_web=req.enable_web)
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
    reply = await generate_reply(req.message, req.session_id, enable_web=req.enable_web)
    audio_b64 = None
    try:
        audio_bytes = synthesize(reply)
        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    except Exception as exc:
        print(f"[TTS error in chat-voice] {exc}")

    return {
        "reply": reply,
        "audio": audio_b64,
        "used_search": needs_search(req.message),
        "model": "Groq",
    }


@app.post("/transcribe")
async def transcribe_audio_endpoint(file: UploadFile = File(...)):
    """Transcribe an audio clip live into text."""
    try:
        audio_bytes = await file.read()
        if not audio_bytes:
            return {"transcript": "", "error": "No audio received"}

        # 1. Try Groq Whisper (ultra-fast, accurate)
        transcript = transcribe_audio_bytes(audio_bytes, file.filename or "audio.webm")
        if transcript:
            return {"transcript": transcript, "source": "groq"}

        # 2. Fallback to local whisper service on port 8001 if available
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(
                    "http://localhost:8001/transcribe",
                    files={"audio": (file.filename or "audio.webm", audio_bytes, file.content_type or "audio/webm")},
                )
                if res.status_code == 200:
                    text = res.json().get("transcript", "").strip()
                    if text:
                        return {"transcript": text, "source": "local"}
        except Exception:
            pass

        return {"transcript": "", "error": "No speech detected"}
    except Exception as exc:
        print(f"[Transcribe endpoint error] {exc}")
        return {"transcript": "", "error": str(exc)}


@app.post("/chat-voice-input")
async def chat_voice_input(
    file: UploadFile | None = File(None),
    transcript: str = Form(""),
    session_id: str = Form("default"),
):
    clean_transcript = transcript.strip() if transcript else ""

    # If no client transcript was provided, transcribe audio
    if not clean_transcript and file:
        audio_bytes = await file.read()
        if audio_bytes:
            clean_transcript = transcribe_audio_bytes(audio_bytes, file.filename or "audio.webm")
            if not clean_transcript:
                try:
                    async with httpx.AsyncClient(timeout=15.0) as client:
                        res = await client.post(
                            "http://localhost:8001/transcribe",
                            files={"audio": (file.filename or "audio.webm", audio_bytes, file.content_type or "audio/webm")},
                        )
                        if res.status_code == 200:
                            clean_transcript = res.json().get("transcript", "").strip()
                except Exception as exc:
                    print(f"[Whisper connection error in chat-voice-input] {exc}")

    if not clean_transcript:
        return {
            "transcript": "",
            "reply": "I couldn't hear that clearly. Could you try speaking again?",
            "audio": None,
            "used_search": False,
            "model": "Groq",
        }

    reply = await generate_reply(clean_transcript, session_id)

    audio_b64 = None
    try:
        audio_bytes_out = synthesize(reply)
        audio_b64 = base64.b64encode(audio_bytes_out).decode("utf-8")
    except Exception as exc:
        print(f"[TTS error in chat-voice-input] {exc}")

    return {
        "transcript": clean_transcript,
        "reply": reply,
        "audio": audio_b64,
        "used_search": needs_search(clean_transcript),
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

