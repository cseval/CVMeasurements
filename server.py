import os, tempfile

# Must be set before mediapipe imports so model downloads work on macOS
try:
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
except ImportError:
    pass

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pipeline import run

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.post("/api/measure")
async def measure(image: UploadFile = File(...)):
    suffix = os.path.splitext(image.filename or ".jpg")[1] or ".jpg"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(await image.read())
        tmp_path = f.name
    try:
        measurements, _ = run(tmp_path)
        return measurements
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        os.unlink(tmp_path)
