from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from agent import generate_reply, needs_search
from tts import synthesize
from email_routes import router as email_router
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

class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"


@app.get("/")
def root():
    return {"status": "VPA backend running"}


@app.post("/chat")
async def chat(req: ChatRequest):
    reply = await generate_reply(req.message, req.session_id)
    return {
        "reply": reply,
        "used_search": needs_search(req.message),
        "model": "llama 3.1 8b",
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
        "model": "llama 3.1 8b",
    }


@app.post("/chat-voice-input")
async def chat_voice_input(file: UploadFile = File(...)):
    audio_bytes = await file.read()
    async with httpx.AsyncClient(timeout=60.0) as client:
        res = await client.post(
            "http://localhost:8001/transcribe",
            files={"audio": (file.filename, audio_bytes, file.content_type)},
        )
    transcript = res.json().get("transcript", "").strip()

    if not transcript:
        return {"reply": "I couldn't hear that clearly. Could you try again?", "audio": None}

    reply = await generate_reply(transcript, "default")

    audio_bytes_out = synthesize(reply)
    audio_b64 = base64.b64encode(audio_bytes_out).decode("utf-8")

    return {
        "transcript": transcript,
        "reply": reply,
        "audio": audio_b64,
        "used_search": needs_search(transcript),
        "model": "llama 3.1 8b",
    }