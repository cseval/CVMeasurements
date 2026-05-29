# CV Measurements

A web app that measures an athlete's **height**, **wingspan**, and **hand span** from a single photo taken on a phone. An operator points the camera at an athlete in a T-pose with a printed ArUco marker on the wall behind them — the app returns measurements in centimeters and shows an annotated photo with the measurement lines overlaid.

---

## How It Works

1. The operator opens the app on their phone and points the camera at the athlete
2. The athlete stands in a T-pose (arms fully extended, palms facing the camera) with the printed ArUco marker flat on the wall beside them
3. The operator taps **CAP** to capture the photo
4. The photo is sent to the Python backend which:
   - Detects the ArUco marker to establish a pixel-per-cm scale
   - Runs MediaPipe Pose to locate body landmarks (nose, heels, fingertips)
   - Runs MediaPipe Hands for more accurate hand landmarks
   - Calculates height (estimated crown to heel), wingspan (middle finger tip to middle finger tip), and hand span (thumb tip to pinky tip)
5. Results are returned with an annotated photo showing exactly which points were used

---

## Tech Stack

**Frontend**

- React 18 + Vite 5
- Runs in the browser — no CV processing on the client
- Hosted on Vercel

**Backend**

- Python + FastAPI
- MediaPipe (pose and hand landmark detection)
- OpenCV (ArUco marker detection and image processing)
- Hosted on Render or Railway or AWS

**Key Python files**

| File                 | Purpose                                                 |
| -------------------- | ------------------------------------------------------- |
| `server.py`          | FastAPI server — single `POST /api/measure` endpoint    |
| `pipeline.py`        | Orchestrates the full measurement flow                  |
| `calibrate.py`       | ArUco marker detection and px/cm scale calculation      |
| `measure.py`         | Measurement math (height, wingspan, hand span)          |
| `visualize.py`       | Draws annotated overlay image returned with results     |
| `generate_marker.py` | One-time utility to generate the printable ArUco marker |

---

## Setup

### Requirements

- Python 3.10+
- Node.js 18+

### Install dependencies

```bash
# Python
pip install -r requirements.txt

# JavaScript
npm install
```

### Generate and print the ArUco marker

```bash
python3 generate_marker.py
```

This creates `marker/marker_20cm.png`. Print it at **100% / actual size** so the black square is exactly the size set in `calibrate.py` (currently `MARKER_CM = 20.0` cm). Tape it flat on the wall at wrist height beside the athlete.

> **Note:** If your printed marker comes out a different size, update `MARKER_CM` in `calibrate.py` to match the actual printed size in centimeters.

---

## Running Locally

You need two terminals running simultaneously, or use the single combined command:

```bash
python3 -m uvicorn server:app --host 0.0.0.0 --reload & npm run dev -- --host
```

- **Backend** runs at `http://localhost:8000`
- **Frontend** runs at `https://localhost:5173`

The Vite dev server proxies `/api` requests to the backend automatically.

### Testing on a phone (same WiFi network)

The frontend runs over HTTPS (required for camera access on mobile). After starting, Vite prints a `Network:` URL like:

```
https://192.168.x.x:5173
```

Open that URL on your phone. You will see a certificate warning — this is expected for local development. Tap **Advanced → Proceed** (Chrome) or **Show Details → Visit this website** (Safari). The warning disappears when deployed to a real domain.

---

## Photo Setup

For accurate measurements:

- Athlete stands with their **back close to the wall**, arms fully extended horizontally at shoulder height
- **Palms face the camera**, fingers together
- The ArUco marker is taped **flat on the wall** at wrist height, fully visible in frame
- Camera is at **chest height**, far enough back that the full body fits in frame
- Good, even lighting — shadows on the hands reduce detection accuracy
- Athlete and marker should be in the **same plane** (marker on the wall, not held in hand)

---

## CLI Usage

You can also run the pipeline directly on a photo without the web app:

```bash
python3 pipeline.py path/to/photo.jpg

# With annotated debug image saved alongside the input
python3 pipeline.py path/to/photo.jpg --debug
```

---

## Deployment

**Frontend → Vercel**

Connect the repo to Vercel. Set the build command to `npm run build` and the output directory to `dist`. Update the `fetch('/api/measure', ...)` call in `src/App.jsx` to point at your deployed backend URL.

**Backend → Render**

Connect the repo to Render as a Python web service. Set the start command to:

```
uvicorn server:app --host 0.0.0.0 --port $PORT
```

Render automatically installs from `requirements.txt`. HTTPS is provided automatically — no certificate warnings in production.
