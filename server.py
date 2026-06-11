import os, tempfile

# Must be set before mediapipe imports so model downloads work on macOS
try:
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
except ImportError:
    pass

from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pipeline import run
from db import search_athletes, get_athlete_status, upsert_measurement, update_additional

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/athletes")
async def athletes(q: str = Query(default="")):
    try:
        return search_athletes(q)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/athletes/{player_id}/status")
async def athlete_status(player_id: int):
    try:
        return get_athlete_status(player_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SaveRequest(BaseModel):
    player_id:     int
    first_name:    str
    last_name:     str
    height_cm:     float
    wingspan_cm:   float
    hand_width_cm: float


@app.post("/api/save")
async def save(req: SaveRequest):
    try:
        row_id, action = upsert_measurement(
            req.player_id, req.first_name, req.last_name,
            req.height_cm, req.wingspan_cm, req.hand_width_cm,
        )
        return {"id": row_id, "action": action}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class AdditionalInfoRequest(BaseModel):
    row_id:              int
    age:                 int | None = None
    weight:              int | None = None
    hips_r_hip_er:       int | None = None
    hips_r_hip_ir:       int | None = None
    hips_l_hip_er:       int | None = None
    hips_l_hip_ir:       int | None = None
    tspine_tspine_rot_l: int | None = None
    tspine_tspine_rot_r: int | None = None
    grip_grip_str_r:     int | None = None
    grip_grip_str_l:     int | None = None


@app.post("/api/save_additional")
async def save_additional(req: AdditionalInfoRequest):
    try:
        fields = req.model_dump(exclude={'row_id'})
        update_additional(req.row_id, fields)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/measure")
async def measure(image: UploadFile = File(...), marker_cm: float = Form(20.0)):
    suffix = os.path.splitext(image.filename or ".jpg")[1] or ".jpg"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(await image.read())
        tmp_path = f.name
    try:
        measurements, _ = run(tmp_path, debug=True, marker_cm=marker_cm)
        return measurements
    except RuntimeError as e:
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        os.unlink(tmp_path)
