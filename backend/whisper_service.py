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

    # Use the original file extension so FFmpeg decodes it correctly
    ext = os.path.splitext(audio.filename or ".webm")[1] or ".webm"
    print(f"Received: {audio.filename}, size: {len(contents)} bytes, ext: {ext}")

    with tempfile.NamedTemporaryFile(suffix=ext, delete=False) as f:
        f.write(contents)
        tmp_path = f.name

    print(f"Saved tmp file: {tmp_path} ({os.path.getsize(tmp_path)} bytes)")
    try:
        segments, info = model.transcribe(
            tmp_path,
            beam_size=5,
            vad_filter=True,
            vad_parameters=dict(
                min_silence_duration_ms=500,
                speech_pad_ms=200,
            ),
            no_speech_threshold=0.6,
            condition_on_previous_text=False,
            language="en"
        )

        text = " ".join(
            s.text.strip() for s in segments
            if s.no_speech_prob < 0.6
        )

        return {
            "transcript": text,
            "language": info.language
        }

    finally:
        os.unlink(tmp_path)
        