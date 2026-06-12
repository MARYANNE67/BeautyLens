"""
MediaPipe Face Mesh Detection
Handles face detection and mesh landmark extraction using MediaPipe
"""
import cv2
import numpy as np
import mediapipe as mp
from typing import List, Tuple, Optional

# Initialize MediaPipe Face Mesh
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

class FaceMeshDetector:
    """Face mesh detector using MediaPipe"""
    
    def __init__(self):
        self.face_mesh = mp_face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
    
    def detect_face_mesh(self, image: np.ndarray) -> Optional[dict]:
        """
        Detect face mesh landmarks in an image
        
        Args:
            image: Input image as numpy array (BGR format from OpenCV)
        
        Returns:
            Dictionary with face mesh data or None if no face detected
        """
        # Convert BGR to RGB for MediaPipe
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Process the image
        results = self.face_mesh.process(rgb_image)
        
        if not results.multi_face_landmarks:
            return None
        
        # Get the first face (we only support one face)
        face_landmarks = results.multi_face_landmarks[0]
        
        # Extract landmark coordinates
        h, w = image.shape[:2]
        landmarks = []
        
        for landmark in face_landmarks.landmark:
            landmarks.append({
                'x': float(landmark.x * w),
                'y': float(landmark.y * h),
                'z': float(landmark.z * w),  # z is relative to image width
            })
        
        # Get face bounding box from landmarks
        x_coords = [lm['x'] for lm in landmarks]
        y_coords = [lm['y'] for lm in landmarks]
        
        bbox = {
            'x': float(min(x_coords)),
            'y': float(min(y_coords)),
            'width': float(max(x_coords) - min(x_coords)),
            'height': float(max(y_coords) - min(y_coords)),
        }
        
        return {
            'landmarks': landmarks,
            'bbox': bbox,
            'num_landmarks': len(landmarks),
        }
    
    def draw_face_mesh(self, image: np.ndarray, face_data: dict) -> np.ndarray:
        """
        Draw face mesh on image
        
        Args:
            image: Input image
            face_data: Face mesh data from detect_face_mesh
        
        Returns:
            Image with face mesh drawn
        """
        # Convert to RGB for drawing
        rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        annotated_image = rgb_image.copy()
        
        # Draw landmarks as small points
        for landmark in face_data['landmarks']:
            x, y = int(landmark['x']), int(landmark['y'])
            cv2.circle(annotated_image, (x, y), 2, (0, 255, 0), -1)
        
        # Draw bounding box
        bbox = face_data['bbox']
        cv2.rectangle(
            annotated_image,
            (int(bbox['x']), int(bbox['y'])),
            (int(bbox['x'] + bbox['width']), int(bbox['y'] + bbox['height'])),
            (0, 255, 0),
            2
        )
        
        # Convert back to BGR
        return cv2.cvtColor(annotated_image, cv2.COLOR_RGB2BGR)
    
    def get_facial_regions(self, face_data: dict) -> dict:
        """
        Extract specific facial regions from landmarks
        Useful for makeup application (lips, eyes, cheeks, etc.)
        
        MediaPipe Face Mesh has 468 landmarks with specific indices for facial features.
        This function extracts key regions for makeup application.
        
        Args:
            face_data: Face mesh data from detect_face_mesh
        
        Returns:
            Dictionary with facial region landmarks
        """
        landmarks = face_data['landmarks']
        
        # MediaPipe Face Mesh landmark indices (468 total landmarks)
        # Using correct MediaPipe Face Mesh landmark indices for proper outlines
        
        # Outer lips (ordered to form a closed loop going clockwise around the lips)
        # MediaPipe outer lip landmarks - must include both upper and lower lips
        # Path: Start at left corner -> Upper lip (left to right) -> Right corner -> Lower lip (right to left) -> Back to start
        # Upper lip outer: 61, 84, 17, 314, 405, 320, 307, 375, 321, 308
        # Lower lip outer: 324, 318, 402, 317, 14, 87, 178, 88, 95, 78
        # Complete path: 61 -> 84 -> 17 -> 314 -> 405 -> 320 -> 307 -> 375 -> 321 -> 308 -> 324 -> 318 -> 402 -> 317 -> 14 -> 87 -> 178 -> 88 -> 95 -> 78 -> 61
        outer_lip_indices = [61, 84, 17, 314, 405, 320, 307, 375, 321, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78]
        
        # Inner lips (for more precise lip area)
        inner_lip_indices = [78, 81, 80, 82, 13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95]
        
        # Left eye (ordered for proper outline - clockwise)
        left_eye_indices = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
        
        # Right eye (ordered for proper outline - clockwise)
        right_eye_indices = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
        
        # Eyeshadow area (above eyes - eyelid/eyebrow region)
        # Left eyeshadow: area above left eye - includes eyebrow and upper eyelid
        # Key landmarks: eyebrow (70, 63, 105, 66, 107, 55, 65, 52, 53, 46) and upper eyelid area
        # Form a region from eyebrow down to just above the eye
        left_eyeshadow_indices = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46, 124, 35, 31, 228, 229, 230, 231, 232, 233, 244, 245, 122, 6, 197, 196, 3, 51, 48, 115, 131, 134, 102, 49, 220, 305, 281, 363, 360]
        
        # Right eyeshadow: area above right eye - includes eyebrow and upper eyelid
        # Key landmarks: eyebrow (300, 293, 334, 296, 336, 285, 295, 282, 283, 276) and upper eyelid area
        right_eyeshadow_indices = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276, 353, 265, 261, 447, 448, 449, 450, 451, 452, 453, 464, 351, 326, 425, 427, 411, 280, 278, 344, 340, 346, 347, 330, 279, 358, 360, 440, 344]
        
        # Face oval/contour (ordered for proper outline)
        face_oval_indices = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
        
        # Under-eye bags (below eyes)
        left_under_eye_indices = [23, 24, 25, 110, 226, 31, 228, 229, 230, 231, 232, 233]
        right_under_eye_indices = [253, 254, 255, 339, 446, 260, 447, 448, 449, 450, 451, 452]
        
        # Around mouth (perioral region)
        around_mouth_indices = [0, 11, 12, 13, 14, 15, 16, 17, 18, 200, 269, 270, 271, 272, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78]
        
        # Filter valid indices
        def get_landmarks(indices):
            return [landmarks[i] for i in indices if 0 <= i < len(landmarks)]
        
        # Get landmarks and ensure proper ordering
        outer_lip_landmarks = get_landmarks(outer_lip_indices)
        inner_lip_landmarks = get_landmarks(inner_lip_indices)
        
        # Split outer lip into upper and lower for fallback
        # Upper lip: first 10 points (61 to 308)
        # Lower lip: last 10 points (324 to 78), but reverse for proper path
        upper_lip_landmarks = get_landmarks(outer_lip_indices[:10])
        lower_lip_landmarks = get_landmarks(outer_lip_indices[10:])
        
        return {
            'outer_lip': outer_lip_landmarks,  # Complete lip outline in order
            'inner_lip': inner_lip_landmarks,
            'upper_lip': upper_lip_landmarks,  # Upper lip only
            'lower_lip': lower_lip_landmarks,  # Lower lip only
            'left_eye': get_landmarks(left_eye_indices),
            'right_eye': get_landmarks(right_eye_indices),
            'face_oval': get_landmarks(face_oval_indices),
            'left_under_eye': get_landmarks(left_under_eye_indices),
            'right_under_eye': get_landmarks(right_under_eye_indices),
            'around_mouth': get_landmarks(around_mouth_indices),
            'left_eyeshadow': get_landmarks(left_eyeshadow_indices),  # Area above left eye
            'right_eyeshadow': get_landmarks(right_eyeshadow_indices),  # Area above right eye
        }

# Global face mesh detector instance
face_mesh_detector: Optional[FaceMeshDetector] = None

def get_face_mesh_detector() -> FaceMeshDetector:
    """Get or create face mesh detector instance"""
    global face_mesh_detector
    if face_mesh_detector is None:
        face_mesh_detector = FaceMeshDetector()
    return face_mesh_detector

