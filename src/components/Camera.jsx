import { useRef, useEffect, useState, useCallback } from 'react';

export default function Camera({ onCapture, disabled }) {
  const videoRef = useRef(null);
  const [streamReady, setStreamReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);

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

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width  = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob((blob) => onCapture(blob), 'image/jpeg', 0.92);
  }, [onCapture]);

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
        <video ref={videoRef} className="camera-video" autoPlay playsInline muted />

        <div className="capture-bar">
          <button
            className="capture-btn"
            onClick={handleCapture}
            disabled={disabled || !streamReady}
          >
            {disabled ? '…' : 'CAP'}
          </button>
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
