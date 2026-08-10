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
        
        # Outer and inner mouth loops from MediaPipe's canonical lip contours.
        # These are complete closed-loop paths around the mouth and mouth opening.
        outer_lip_indices = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
        inner_lip_indices = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191]

        # Closed filled lip surfaces. Each polygon follows the outside contour
        # from left mouth corner to right mouth corner, then returns along the
        # inner mouth contour. This avoids filling teeth while still drawing
        # both upper and lower lips independently.
        upper_lip_indices = [61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191, 78]
        lower_lip_indices = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78]
        
        # Left eye (ordered for proper outline - clockwise)
        left_eye_indices = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
        
        # Right eye (ordered for proper outline - clockwise)
        right_eye_indices = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
        
        # Eyeshadow tutorial zones: compact eyelid/crease bands, intentionally
        # below the eyebrow landmarks. Each polygon follows the crease above
        # the eye, then returns along the upper eyelid.
        left_eyeshadow_indices = [130, 247, 30, 29, 27, 28, 56, 190, 243, 133, 173, 157, 158, 159, 160, 161, 246, 33]
        right_eyeshadow_indices = [359, 467, 260, 259, 257, 258, 286, 414, 463, 362, 398, 384, 385, 386, 387, 388, 466, 263]
        
        # Face oval/contour (ordered for proper outline)
        face_oval_indices = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
        
        # Under-eye bags (below eyes)
        left_under_eye_indices = [23, 24, 25, 110, 226, 31, 228, 229, 230, 231, 232, 233]
        # Position-by-position mirrors of the left list. An earlier version
        # had the tail off by one (…260, 447, 448…), which put two points
        # (260, 447) ~25px from the left side's mirrored positions while
        # every other pair sat within the ~3-7px natural facial-asymmetry
        # noise floor -- measured by reflecting the left points across the
        # face midline on a real portrait and comparing. The result was a
        # visibly uneven left-vs-right under-eye region.
        right_under_eye_indices = [253, 254, 255, 339, 446, 261, 448, 449, 450, 451, 452, 453]
        
        # Around mouth (perioral region)
        around_mouth_indices = [0, 11, 12, 13, 14, 15, 16, 17, 18, 200, 269, 270, 271, 272, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78]
        
        # Filter valid indices
        def get_landmarks(indices):
            return [landmarks[i] for i in indices if 0 <= i < len(landmarks)]
        
        # Get landmarks and ensure proper ordering
        outer_lip_landmarks = get_landmarks(outer_lip_indices)
        inner_lip_landmarks = get_landmarks(inner_lip_indices)
        
        upper_lip_landmarks = get_landmarks(upper_lip_indices)
        lower_lip_landmarks = get_landmarks(lower_lip_indices)
        
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
