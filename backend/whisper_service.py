from fastapi import FastAPI, UploadFile, File
from faster_whisper import WhisperModel
import tempfile
import os

app = FastAPI()

model = WhisperModel(
    "large-v3-turbo",
    device="cpu",
    compute_type="int8",
    cpu_threads=8,
    num_workers=1
)

@app.get("/")
def root():
    return {"status": "Whisper API Running"}

@app.post("/transcribe")
async def transcribe(audio: UploadFile = File(...)):
    contents = await audio.read()

    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        f.write(contents)
        tmp_path = f.name
        
    print(f"File size: {os.path.getsize(tmp_path)} bytes")
    try:
        segments, info = model.transcribe(
            tmp_path,
            beam_size=1,
            vad_filter=False,

            language="en"
        )

        text = " ".join(
            s.text.strip() for s in segments
        )

        return {
            "transcript": text,
            "language": info.language
        }

    finally:
        os.unlink(tmp_path)
        