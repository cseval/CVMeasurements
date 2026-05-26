// MediaPipe Tasks Vision — pose + hand landmarker initialization and detection

import { PoseLandmarker, HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const POSE_MODEL  = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task';
const HANDS_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

let poseLandmarker = null;
let handLandmarker = null;

export async function initModels(onProgress) {
  onProgress?.('Loading pose model…');
  const vision = await FilesetResolver.forVisionTasks(WASM_PATH);

  poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: POSE_MODEL,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  onProgress?.('Loading hand model…');
  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: HANDS_MODEL,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });

  onProgress?.(null);
}

export function detectPoseVideo(source, timestamp) {
  if (!poseLandmarker) throw new Error('Pose model not initialized');
  return poseLandmarker.detectForVideo(source, timestamp);
}

export function detectHandsVideo(source, timestamp) {
  if (!handLandmarker) throw new Error('Hand model not initialized');
  return handLandmarker.detectForVideo(source, timestamp);
}

export function modelsReady() {
  return !!(poseLandmarker && handLandmarker);
}
