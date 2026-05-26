import { useRef, useEffect, useState, useCallback } from 'react';
import { detectPoseVideo, detectHandsVideo } from '../lib/mediapipe.js';
import { detectMarker } from '../lib/opencv.js';
import { wingspanTips, PoseLM } from '../lib/measure.js';

const PREVIEW_INTERVAL_MS = 150; // ~6fps for live detection
const ARUCO_INTERVAL_MS   = 1500; // re-check marker every 1.5s

// Overlay drawing constants
const COLOR_HEIGHT   = 'rgba(96, 165, 250, 0.9)';    // blue
const COLOR_WINGSPAN = 'rgba(249, 115, 22, 0.9)';    // orange
const COLOR_CROWN    = 'rgba(239, 68, 68, 0.95)';    // red
const COLOR_LANDMARK = 'rgba(255, 255, 255, 0.85)';  // white
const COLOR_MARKER   = 'rgba(34, 197, 94, 0.9)';     // green
const HEAD_OFFSET_RATIO = 0.13;

function visAlpha(lm) {
  return Math.max(0.25, lm?.visibility ?? 0.5);
}

function drawDot(ctx, x, y, r, color) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawLine(ctx, x1, y1, x2, y2, color, width = 3) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function drawOverlay(ctx, w, h, poseLms, allHandsLms, markerCorners) {
  ctx.clearRect(0, 0, w, h);

  // ArUco marker outline
  if (markerCorners) {
    ctx.beginPath();
    ctx.moveTo(markerCorners[0][0], markerCorners[0][1]);
    for (let i = 1; i < 4; i++) ctx.lineTo(markerCorners[i][0], markerCorners[i][1]);
    ctx.closePath();
    ctx.strokeStyle = COLOR_MARKER;
    ctx.lineWidth = 3;
    ctx.stroke();
    for (const [cx, cy] of markerCorners) {
      drawDot(ctx, cx, cy, 5, COLOR_MARKER);
    }
  }

  if (!poseLms) return;

  const nose      = poseLms[PoseLM.NOSE];
  const leftHeel  = poseLms[PoseLM.LEFT_HEEL];
  const rightHeel = poseLms[PoseLM.RIGHT_HEEL];

  const noseX  = nose.x * w;
  const noseY  = nose.y * h;
  const heelY  = Math.max(leftHeel.y, rightHeel.y) * h;
  const span   = heelY - noseY;
  const crownY = noseY - span * HEAD_OFFSET_RATIO;

  // Height line
  const alpha = Math.min(visAlpha(nose), visAlpha(leftHeel), visAlpha(rightHeel));
  ctx.globalAlpha = alpha;
  drawLine(ctx, noseX, crownY, noseX, heelY, COLOR_HEIGHT, 3);
  drawDot(ctx, noseX, crownY, 8, COLOR_CROWN);
  drawDot(ctx, leftHeel.x  * w, leftHeel.y  * h, 7, COLOR_LANDMARK);
  drawDot(ctx, rightHeel.x * w, rightHeel.y * h, 7, COLOR_LANDMARK);
  ctx.globalAlpha = 1;

  // Wingspan line
  const [leftPt, rightPt] = wingspanTips(poseLms, w, h, allHandsLms);
  const wingAlpha = allHandsLms?.length >= 2 ? 0.95 : 0.6;
  ctx.globalAlpha = wingAlpha;
  drawLine(ctx, leftPt[0], leftPt[1], rightPt[0], rightPt[1], COLOR_WINGSPAN, 3);
  drawDot(ctx, leftPt[0],  leftPt[1],  8, COLOR_LANDMARK);
  drawDot(ctx, rightPt[0], rightPt[1], 8, COLOR_LANDMARK);
  ctx.globalAlpha = 1;
}

export default function Camera({ onCapture, disabled }) {
  const videoRef   = useRef(null);
  const overlayRef = useRef(null);
  const rafRef     = useRef(null);
  const lastDetectRef  = useRef(0);
  const lastMarkerRef  = useRef(0);
  const poseResultRef  = useRef(null);
  const handsResultRef = useRef(null);
  const markerRef      = useRef(null); // { corners, pxPerCm } | null

  const [streamReady, setStreamReady]   = useState(false);
  const [cameraError, setCameraError]   = useState(null);
  const [markerFound, setMarkerFound]   = useState(false);
  const [poseFound,   setPoseFound]     = useState(false);
  const [handsFound,  setHandsFound]    = useState(false);

  // Open camera
  useEffect(() => {
    let stream;
    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      .then((s) => {
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        video.onloadedmetadata = () => setStreamReady(true);
      })
      .catch((err) => setCameraError(err.message));

    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Detection + overlay loop
  useEffect(() => {
    if (!streamReady) return;

    const video   = videoRef.current;
    const overlay = overlayRef.current;
    const ctx     = overlay.getContext('2d');
    let offscreen = null;

    function loop(now) {
      rafRef.current = requestAnimationFrame(loop);

      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!vw || !vh) return;

      // Sync overlay size to video dimensions
      if (overlay.width !== vw || overlay.height !== vh) {
        overlay.width  = vw;
        overlay.height = vh;
        offscreen = null;
      }

      // Throttled detection
      if (now - lastDetectRef.current >= PREVIEW_INTERVAL_MS) {
        lastDetectRef.current = now;

        if (!offscreen) {
          offscreen        = document.createElement('canvas');
          offscreen.width  = vw;
          offscreen.height = vh;
        }
        offscreen.getContext('2d').drawImage(video, 0, 0, vw, vh);

        const ts = performance.now();
        try {
          poseResultRef.current  = detectPoseVideo(offscreen, ts);
          handsResultRef.current = detectHandsVideo(offscreen, ts);
        } catch (_) {}

        const hasPose  = !!poseResultRef.current?.landmarks?.[0];
        const hasHands = (handsResultRef.current?.landmarks?.length ?? 0) > 0;
        setPoseFound(hasPose);
        setHandsFound(hasHands);

        // ArUco: re-check on interval
        if (now - lastMarkerRef.current >= ARUCO_INTERVAL_MS) {
          lastMarkerRef.current = now;
          const m = detectMarker(offscreen);
          markerRef.current = m;
          setMarkerFound(!!m);
        }
      }

      const poseLms     = poseResultRef.current?.landmarks?.[0] ?? null;
      const allHandsLms = handsResultRef.current?.landmarks    ?? null;
      drawOverlay(ctx, vw, vh, poseLms, allHandsLms, markerRef.current?.corners ?? null);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [streamReady]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const captureCanvas        = document.createElement('canvas');
    captureCanvas.width        = video.videoWidth;
    captureCanvas.height       = video.videoHeight;
    captureCanvas.getContext('2d').drawImage(video, 0, 0);

    const ts = performance.now();
    onCapture(captureCanvas, poseResultRef.current, handsResultRef.current, ts);
  }, [onCapture]);

  const isReady = markerFound && poseFound;

  if (cameraError) {
    return (
      <div className="camera-screen">
        <div style={{ padding: 24 }}>
          <div className="error-card">Camera error: {cameraError}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="camera-screen">
      <div className="camera-wrapper">
        <video
          ref={videoRef}
          className="camera-video"
          autoPlay
          playsInline
          muted
        />
        <canvas ref={overlayRef} className="camera-overlay" />

        {/* Status badge */}
        <div className={`status-badge ${isReady ? 'ready' : 'searching'}`}>
          {isReady ? '✓ READY' : 'Searching…'}
        </div>

        {/* Hint chips */}
        <div className="hint-row">
          <span className={`hint-chip ${markerFound ? 'ok' : 'missing'}`}>
            {markerFound ? '✓ Marker' : '✗ Marker'}
          </span>
          <span className={`hint-chip ${poseFound ? 'ok' : 'missing'}`}>
            {poseFound ? '✓ Pose' : '✗ Pose'}
          </span>
          <span className={`hint-chip ${handsFound ? 'ok' : 'missing'}`}>
            {handsFound ? '✓ Hands' : '✗ Hands'}
          </span>
        </div>

        {/* Capture button */}
        <div className="capture-bar">
          <button
            className="capture-btn"
            onClick={handleCapture}
            disabled={disabled || !streamReady}
          >
            {disabled ? '…' : 'CAP'}
          </button>
        </div>

        {/* Processing overlay */}
        {disabled && (
          <div className="processing-overlay">
            <div className="spinner" />
            <p>Measuring…</p>
          </div>
        )}
      </div>
    </div>
  );
}
