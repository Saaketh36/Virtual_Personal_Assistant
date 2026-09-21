import subprocess
import tempfile
import os

PIPER_EXE = os.getenv("PIPER_EXE", r"C:\Users\saake\AppData\Local\piper\piper\piper.exe")
VOICE_MODEL = os.getenv("VOICE_MODEL", r"C:\Users\saake\AppData\Local\piper\en_US-lessac-medium.onnx")


def synthesize(text: str) -> bytes:
    if not os.path.exists(PIPER_EXE):
        raise FileNotFoundError(f"Piper executable not found at '{PIPER_EXE}'. Please set PIPER_EXE.")
    if not os.path.exists(VOICE_MODEL):
        raise FileNotFoundError(f"Piper voice model not found at '{VOICE_MODEL}'. Please set VOICE_MODEL.")

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        tmp_path = f.name

    try:
        subprocess.run(
            [PIPER_EXE, "--model", VOICE_MODEL, "--output_file", tmp_path],
            input=text.encode("utf-8"),
            check=True,
            capture_output=True,
        )
        with open(tmp_path, "rb") as f:
            return f.read()
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)