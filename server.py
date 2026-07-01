import os, tempfile, hmac, hashlib, time

# Must be set before mediapipe imports so model downloads work on macOS
try:
    import certifi
    os.environ.setdefault("SSL_CERT_FILE", certifi.where())
except ImportError:
    pass

from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from pydantic import BaseModel
from pipeline import run
from db import search_athletes, search_events, get_event_roster, get_athlete_status, upsert_measurement, update_additional
from generate_marker import marker_square_png_bytes, marker_pdf_bytes, ALL_SIZES

# ── Auth config ────────────────────────────────────────────────────────────────
AUTH_SECRET     = os.environ.get("AUTH_SECRET", "")
AUTH_PASSPHRASE = os.environ.get("AUTH_PASSPHRASE", "")
COOKIE_MAX_AGE  = 7 * 24 * 60 * 60  # 7 days in seconds

def _make_token() -> str:
    ts  = str(int(time.time()))
    sig = hmac.new(AUTH_SECRET.encode(), ts.encode(), hashlib.sha256).hexdigest()
    return f"{ts}.{sig}"

def _verify_token(token: str) -> bool:
    try:
        ts, sig = token.rsplit(".", 1)
        expected = hmac.new(AUTH_SECRET.encode(), ts.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return False
        return (int(time.time()) - int(ts)) < COOKIE_MAX_AGE
    except Exception:
        return False

# ── CORS — credentials require explicit origins (no wildcard) ─────────────────
ALLOWED_ORIGINS = [
    o.strip() for o in
    os.environ.get(
        "ALLOWED_ORIGINS",
        "https://localhost:5173,http://localhost:5173"
    ).split(",")
    if o.strip()
]

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ── Auth middleware ────────────────────────────────────────────────────────────
_PUBLIC = {"/api/login", "/api/logout", "/api/auth/check"}

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    # Let CORS preflight and public auth endpoints through unauthenticated
    if request.method == "OPTIONS" or request.url.path in _PUBLIC:
        return await call_next(request)
    # Marker endpoints are public (staff need to print markers before logging in)
    if request.url.path.startswith("/api/marker"):
        return await call_next(request)
    cse_auth = request.cookies.get("cse_auth")
    if not cse_auth or not _verify_token(cse_auth):
        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


@app.get("/api/athletes")
async def athletes(q: str = Query(default="")):
    try:
        return search_athletes(q)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/events")
async def events(q: str = Query(default="")):
    try:
        return search_events(q)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/events/{event_id}/roster")
async def event_roster(event_id: int):
    try:
        return get_event_roster(event_id)
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
    event_id:      int | None = None
    user_id:       int | None = None


@app.post("/api/save")
async def save(req: SaveRequest):
    try:
        row_id, action = upsert_measurement(
            req.player_id, req.first_name, req.last_name,
            req.height_cm, req.wingspan_cm, req.hand_width_cm,
            req.event_id, req.user_id,
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


@app.get("/api/marker/{cm}")
async def marker(cm: float):
    if cm not in ALL_SIZES:
        raise HTTPException(status_code=400, detail=f"Marker size must be one of {ALL_SIZES}")
    png_bytes = marker_square_png_bytes(cm)
    return Response(content=png_bytes, media_type="image/png")


@app.get("/api/marker/{cm}/pdf")
async def marker_pdf(cm: float):
    if cm not in ALL_SIZES:
        raise HTTPException(status_code=400, detail=f"Marker size must be one of {ALL_SIZES}")
    pdf_bytes = marker_pdf_bytes(cm)
    headers = {"Content-Disposition": f'inline; filename="marker_{int(cm)}cm.pdf"'}
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@app.get("/api/auth/check")
async def auth_check(request: Request):
    cse_auth = request.cookies.get("cse_auth")
    if not cse_auth or not _verify_token(cse_auth):
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {"ok": True}


class LoginRequest(BaseModel):
    passphrase: str

@app.post("/api/login")
async def login(req: LoginRequest, response: Response):
    if not AUTH_PASSPHRASE or not AUTH_SECRET:
        raise HTTPException(status_code=500, detail="Auth not configured")
    if not hmac.compare_digest(req.passphrase, AUTH_PASSPHRASE):
        raise HTTPException(status_code=401, detail="Invalid access code")
    token = _make_token()
    response.set_cookie(
        key="cse_auth",
        value=token,
        max_age=COOKIE_MAX_AGE,
        httponly=True,
        secure=True,
        samesite="none",
    )
    return {"ok": True}


@app.post("/api/logout")
async def logout(response: Response):
    response.delete_cookie(key="cse_auth", samesite="none", secure=True)
    return {"ok": True}


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
