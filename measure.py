import numpy as np
import mediapipe.python.solutions.pose as mp_pose

PoseLM = mp_pose.PoseLandmark

# Nose sits roughly 13% of the nose-to-heel span below the crown.
# Empirically derived; adjust if you find systematic over/under-estimation.
HEAD_OFFSET_RATIO = 0.13

# MediaPipe Hands landmark index for the middle finger tip.
# Middle finger is the longest and gives the most accurate wingspan endpoint.
MIDDLE_TIP = 12


def _px_dist(lm_a, lm_b, frame_w: int, frame_h: int) -> float:
    dx = (lm_a.x - lm_b.x) * frame_w
    dy = (lm_a.y - lm_b.y) * frame_h
    return np.hypot(dx, dy)


def measure_height(pose_lms, frame_h: int, px_per_cm: float) -> float:
    """
    Vertical distance from estimated crown to lower heel, in cm.
    Requires a straight-on, full-body photo with both heels visible.
    """
    nose       = pose_lms[PoseLM.NOSE]
    left_heel  = pose_lms[PoseLM.LEFT_HEEL]
    right_heel = pose_lms[PoseLM.RIGHT_HEEL]

    heel_y  = max(left_heel.y, right_heel.y)
    span    = heel_y - nose.y
    crown_y = nose.y - span * HEAD_OFFSET_RATIO

    return ((heel_y - crown_y) * frame_h) / px_per_cm


def wingspan_tips(
    pose_lms,
    frame_w: int,
    frame_h: int,
    all_hands_lms=None,
) -> tuple[tuple[int, int], tuple[int, int]]:
    """
    Return (left_pt, right_pt) pixel coordinates for the wingspan endpoints.

    When both hands are detected by the hands model, uses the middle finger
    tip (landmark 12) from each hand -- the longest finger and the correct
    landmark for fingertip-to-fingertip wingspan.  Falls back to the pose
    index fingertip landmarks when fewer than two hands are available.

    left_pt / right_pt refer to image-left and image-right respectively.
    """
    if all_hands_lms and len(all_hands_lms) >= 2:
        tips = []
        for hlm in all_hands_lms:
            tip = hlm.landmark[MIDDLE_TIP]
            tips.append((int(tip.x * frame_w), int(tip.y * frame_h)))
        tips.sort(key=lambda p: p[0])
        return tips[0], tips[-1]

    # Fallback: pose index fingertips (sorted so left/right are image-consistent).
    li = pose_lms[PoseLM.LEFT_INDEX]
    ri = pose_lms[PoseLM.RIGHT_INDEX]
    pt_a = (int(li.x * frame_w), int(li.y * frame_h))
    pt_b = (int(ri.x * frame_w), int(ri.y * frame_h))
    return (pt_a, pt_b) if pt_a[0] < pt_b[0] else (pt_b, pt_a)


def measure_wingspan(
    pose_lms,
    frame_w: int,
    frame_h: int,
    px_per_cm: float,
    all_hands_lms=None,
) -> float:
    """
    Fingertip-to-fingertip distance in cm.

    Uses middle finger tips from the hands model when both hands are detected
    (more precise than pose landmarks).  Falls back to pose index fingertips.
    Requires arms extended horizontally at shoulder height.
    """
    left_pt, right_pt = wingspan_tips(pose_lms, frame_w, frame_h, all_hands_lms)
    dx = right_pt[0] - left_pt[0]
    dy = right_pt[1] - left_pt[1]
    return np.hypot(dx, dy) / px_per_cm


def measure_hand_width(hand_lms, frame_w: int, frame_h: int, px_per_cm: float) -> float:
    """
    Index-MCP to pinky-MCP distance in cm (knuckle width across palm).
    Requires hand flat with fingers together, marker in same plane.
    Landmark 5  = index finger MCP
    Landmark 17 = pinky MCP
    """
    idx_mcp   = hand_lms.landmark[5]
    pinky_mcp = hand_lms.landmark[17]
    return _px_dist(idx_mcp, pinky_mcp, frame_w, frame_h) / px_per_cm
