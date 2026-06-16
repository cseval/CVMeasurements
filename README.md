# CV Measurements

A web app that measures an athlete's **height**, **wingspan**, and **hand span** from a single photo taken on a phone. An operator selects an event, picks a player from the event roster, then points the camera at the athlete in a T-pose with a printed ArUco marker on the wall behind them. The app returns measurements in centimeters, shows an annotated photo with the measurement lines overlaid, and saves the results to the database. A second screen lets the operator enter additional physical assessment data (age, weight, hip/t-spine/grip measurements) for the same player.

---

## How It Works

1. The operator opens the app and searches for an event by name
2. The operator selects the event — the roster of registered players loads automatically
3. The operator selects a player from the roster
4. The athlete stands in a T-pose (arms fully extended, palms facing the camera) with the printed ArUco marker flat on the wall beside them
5. The operator taps **CAP** to capture the photo
6. The photo is sent to the Python backend which:
   - Detects the ArUco marker to establish a pixel-per-cm scale
   - Runs MediaPipe Pose to locate body landmarks (nose, heels, fingertips)
   - Runs MediaPipe Hands for more accurate hand landmarks
   - Calculates height (estimated crown to heel), wingspan (middle finger tip to middle finger tip), and hand span (thumb tip to pinky tip)
7. Results are returned with an annotated photo showing exactly which points were used
8. The operator saves the measurements to the database, then optionally enters additional assessment data (age, weight, hip rotation, t-spine rotation, grip strength)

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
- Hosted on Azure App Service

**Key Python files**

| File                 | Purpose                                                        |
| -------------------- | -------------------------------------------------------------- |
| `server.py`          | FastAPI server — all API endpoints                             |
| `db.py`              | Database queries (events, roster, save measurements)           |
| `pipeline.py`        | Orchestrates the full measurement flow                         |
| `calibrate.py`       | ArUco marker detection and px/cm scale calculation             |
| `measure.py`         | Measurement math (height, wingspan, hand span)                 |
| `visualize.py`       | Draws annotated overlay image returned with results            |
| `generate_marker.py` | One-time utility to generate the printable ArUco marker        |

**API endpoints**

| Endpoint                          | Purpose                                      |
| --------------------------------- | -------------------------------------------- |
| `GET /api/events`                 | Search events by name                        |
| `GET /api/events/{id}/roster`     | Get player roster for an event               |
| `GET /api/athletes/{id}/status`   | Check if a player already has a DB row       |
| `POST /api/measure`               | Run CV pipeline on a photo                   |
| `POST /api/save`                  | Save height/wingspan/hand span to DB         |
| `POST /api/save_additional`       | Save additional assessment data to DB        |

---

## Setup

### Requirements

- Python 3.11 (mediapipe does not support 3.12+)
- Node.js 18+

### Install dependencies

```bash
# Python
pip3 install -r requirements.txt

# JavaScript
npm install
```

### Verify dependencies are installed

After installing, confirm everything is in place:

```bash
# Check Python version (should be 3.11.x)
python3 --version

# Check all Python packages are satisfied (no errors = good)
pip3 install -r requirements.txt --dry-run

# Check Node.js version (should be 18+)
node --version

# Check Vite and React are present
npm list vite react
```

All lines in the pip output should say "Requirement already satisfied". If any package is missing it will say "Would install" — run `pip3 install -r requirements.txt` to fix it.

### Create a `.env` file

Create a file named `.env` in the project root with the following keys (get values from the team):

```
DB_HOST=
DB_PORT=3306
DB_NAME=
DB_USER=
DB_PASSWORD=
```

The app will fail to start without this file.

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

The production deployment is split:

- **Backend:** Azure App Service for Linux, Python 3.11
- **Frontend:** Vercel, Vite static build

### Backend - Azure App Service

Use a Linux App Service with Python 3.11. Do not use the Free/Shared tier for this app; MediaPipe and OpenCV need real CPU and memory. Start with at least `B2`, and move to a production tier such as `P1v3` if startup or measurement processing is slow.

Create or scale the App Service Plan:

```bash
az appservice plan create \
  --resource-group rg-cvmeasurements \
  --name asp-cvmeasurements \
  --is-linux \
  --sku B2
```

Create the web app if it does not already exist:

```bash
az webapp create \
  --resource-group rg-cvmeasurements \
  --plan asp-cvmeasurements \
  --name cvmeasurements-api \
  --runtime "PYTHON|3.11"
```

Set the startup command:

```bash
az webapp config set \
  --resource-group rg-cvmeasurements \
  --name cvmeasurements-api \
  --startup-file "python -m uvicorn server:app --host 0.0.0.0 --port 8000"
```

Set application settings. `SCM_DO_BUILD_DURING_DEPLOYMENT=true` tells Azure/Oryx to install Python dependencies during deployment. `POST_BUILD_COMMAND` removes the GUI OpenCV package that MediaPipe can pull in and keeps only the headless OpenCV package required on Azure Linux.

```bash
az webapp config appsettings set \
  --resource-group rg-cvmeasurements \
  --name cvmeasurements-api \
  --settings \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true \
    POST_BUILD_COMMAND="bash scripts/azure_post_build.sh" \
    DB_HOST="..." \
    DB_PORT="3306" \
    DB_NAME="..." \
    DB_USER="..." \
    DB_PASSWORD="..."
```

If App Service authentication is enabled, allow anonymous API access or turn it off:

```bash
az webapp auth update \
  --resource-group rg-cvmeasurements \
  --name cvmeasurements-api \
  --enabled false
```

Restart after configuration changes:

```bash
az webapp restart \
  --resource-group rg-cvmeasurements \
  --name cvmeasurements-api
```

### GitHub Actions Deployment to Azure

Use Azure App Service Deployment Center:

1. Open the Azure App Service.
2. Go to **Deployment Center**.
3. Source: **GitHub**.
4. Provider: **GitHub Actions**.
5. Organization: `cseval`.
6. Repository: `CVMeasurements`.
7. Branch: `azure-deploy` or your production branch.
8. Authentication: **User-assigned identity**. Select an existing managed identity or create a new one. The identity needs `Website Contributor` on the App Service.
9. Save the setup.

Azure should create a workflow under `.github/workflows/`. A successful run deploys the repository to the App Service, then Oryx installs `requirements.txt`.

After deployment, test the backend:

```text
https://cvmeasurements-api.azurewebsites.net/api/events?q=test
```

Expected result: a JSON array. An empty array is fine if no event matches `test`.

### Frontend - Vercel

Connect the same GitHub repo to Vercel.

Use these build settings:

```text
Framework Preset: Vite
Build Command: npm run build
Output Directory: dist
Install Command: npm ci
```

The frontend currently calls relative `/api/...` paths. In production, add a Vercel rewrite so those calls are proxied to Azure:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://cvmeasurements-api.azurewebsites.net/api/:path*"
    }
  ]
}
```

Alternatively, refactor the frontend fetch calls to use a `VITE_API_BASE_URL` environment variable and set that value in Vercel.

### Deployment Troubleshooting

**GitHub deploy fails with `Site Disabled (CODE: 403)`**

Check the App Service state:

```bash
az webapp show \
  --resource-group rg-cvmeasurements \
  --name cvmeasurements-api \
  --query "{state:state, enabled:enabled, publicNetworkAccess:publicNetworkAccess}" \
  -o table
```

If `state` is `QuotaExceeded`, scale the App Service Plan up from Free/Shared to at least `B2`:

```bash
az appservice plan update \
  --resource-group rg-cvmeasurements \
  --name asp-cvmeasurements \
  --sku B2
```

**Startup fails with `ImportError: libxcb.so... cannot open shared object file`**

Azure has installed a GUI OpenCV wheel. Confirm:

- `requirements.txt` uses `opencv-contrib-python-headless`
- `POST_BUILD_COMMAND` is set to `bash scripts/azure_post_build.sh`
- the latest commit was deployed

Then redeploy and check the startup logs for:

```text
OpenCV 4.10.0 loaded from ...
```

**Backend returns 403**

Check:

- You are using `https://cvmeasurements-api.azurewebsites.net/api/...`, not the `.scm.azurewebsites.net` URL
- App Service authentication is off or allows unauthenticated requests
- Public network access is enabled
- Access restrictions are not blocking your IP

**Backend returns 500**

Open App Service **Log stream** and retry the request. Common causes are missing DB application settings, MySQL network/firewall rules, or invalid DB credentials.
