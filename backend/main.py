from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from agent import generate_reply
from tts import synthesize
import base64

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str
    session_id: str = "default"


@app.get("/")
def root():
    return {"status": "VPA backend running"}


@app.post("/chat")
async def chat(req: ChatRequest):
    reply = await generate_reply(req.message, req.session_id)
    return {"reply": reply}


@app.post("/chat-voice")
async def chat_voice(req: ChatRequest):
    reply = await generate_reply(req.message, req.session_id)
    audio_bytes = synthesize(reply)
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    return {"reply": reply, "audio": audio_b64}