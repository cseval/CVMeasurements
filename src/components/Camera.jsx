import { useRef, useEffect, useState, useCallback } from 'react';
import BrandBar from './BrandBar.jsx';

export default function Camera({ onCapture, onBack, disabled }) {
  const videoRef = useRef(null);
  const [streamReady, setStreamReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [countdown, setCountdown] = useState(null);
  const [useCountdown, setUseCountdown] = useState(false);

  useEffect(() => {
    let stream;
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    })
    .then((s) => {
      stream = s;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = s;
      video.onloadedmetadata = () => setStreamReady(true);
    })
    .catch((err) => setCameraError(err.message));

    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  const shoot = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => onCapture(blob), 'image/jpeg', 0.92);
  }, [onCapture]);

  const handleCapture = useCallback(() => {
    if (!useCountdown) {
      shoot();
      return;
    }
    let count = 5;
    setCountdown(count);
    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setCountdown(count);
      } else {
        clearInterval(interval);
        setCountdown(null);
        shoot();
      }
    }, 1000);
  }, [useCountdown, shoot]);

  if (cameraError) {
    return (
      <div className="camera-screen">
        <BrandBar />
        <div style={{ padding: 24 }}>
          <button className="camera-back-btn" style={{ position: 'static', marginBottom: 16 }} onClick={onBack} aria-label="Back">×</button>
          <div className="error-card">Camera error: {cameraError}</div>
        </div>
      </div>
    );
  }

  const isCounting = countdown !== null;

  return (
    <div className="camera-screen">
      <BrandBar />
      <div className="camera-wrapper">
        <video ref={videoRef} className="camera-video" autoPlay playsInline muted />

        <button className="camera-back-btn" onClick={onBack} disabled={disabled} aria-label="Back">×</button>

        {isCounting && (
          <div className="countdown-overlay">
            <span className="countdown-number">{countdown}</span>
          </div>
        )}

        <div className="capture-bar">
          <button
            className="timer-toggle"
            onClick={() => setUseCountdown((v) => !v)}
            disabled={disabled || isCounting}
          >
            {useCountdown ? '5s' : 'instant'}
          </button>

          <button
            className="capture-btn"
            onClick={handleCapture}
            disabled={disabled || !streamReady || isCounting}
          >
            {disabled ? '…' : 'CAP'}
          </button>

          {/* spacer to keep CAP centered */}
          <div style={{ width: 52 }} />
        </div>

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
