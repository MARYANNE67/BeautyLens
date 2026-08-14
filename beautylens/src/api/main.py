"""
FastAPI Backend for Makeup Product Detection
Handles image uploads and YOLO model inference
"""
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from ultralytics import YOLO
import cv2
import numpy as np
from PIL import Image
import io
from typing import Optional
import os
from pathlib import Path
from src.api.product_classes import normalize_class_name, ProductClass, get_display_name
from src.api.db import init_db, SessionLocal
from src.api.firebase_auth import init_firebase
from src.api.seed_data import seed_shade_catalog
from src.api.routers.auth import router as auth_router
from src.api.routers.profile import router as profile_router
from src.api.routers.skin_scan import router as skin_scan_router
from src.api.routers.recommendations import router as recommendations_router
from src.api.routers.tryon import router as tryon_router
import os
from dotenv import load_dotenv
from src.api.product_recognition import extract_text_from_image_region, parse_product_from_text
from fastapi import FastAPI, File, UploadFile, HTTPException

load_dotenv()

# Import face mesh detector (optional - only if MediaPipe is installed)
try:
    from src.api.face_mesh import get_face_mesh_detector
    FACE_MESH_AVAILABLE = True
except ImportError as e:
    print(f"Warning: Face mesh not available. MediaPipe may not be installed: {e}")
    FACE_MESH_AVAILABLE = False
    def get_face_mesh_detector():
        raise ImportError("MediaPipe is not installed. Run: pip install mediapipe")

# Global model variable
model: Optional[YOLO] = None
model_path: Optional[str] = None
confidence_threshold: float = 0.25
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB


def load_model(path: str):
    """Load YOLO model from .pt file"""
    global model, model_path
    try:
        if not os.path.exists(path):
            raise FileNotFoundError(f"Model file not found: {path}")
        
        model = YOLO(path)
        model_path = path
        print(f"Model loaded successfully: {path}")
        return True
    except Exception as e:
        print(f"Error loading model: {str(e)}")
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("Starting up API server...")
    default_model_path = os.getenv("MODEL_PATH", "models/final/best.pt")
    
    if os.path.exists(default_model_path):
        try:
            load_model(default_model_path)
        except Exception as e:
            print(f"Could not load default model: {str(e)}")
    else:
        print(f"Warning: Model file not found at {default_model_path}")

    # Non-fatal: the detection/face-mesh endpoints don't need auth, so a missing
    # service-account key degrades the authenticated routes to a clear 503
    # rather than taking the whole API down.
    firebase_error = init_firebase()
    if firebase_error:
        print(f"Warning: {firebase_error}")
    else:
        print("Firebase Admin initialised")

    init_db()
    with SessionLocal() as db:
        seeded = seed_shade_catalog(db)
        if seeded:
            print(f"Seeded shade catalog: {seeded} shades")
        else:
            print("Shade catalog already seeded, skipping")

    yield
    print("Shutting down API server...")


app = FastAPI(
    title="Makeup Product Detection API",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for mobile app
allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:19000").split(",")

# allow_credentials stays off: the API authenticates via the Authorization
# header only (no cookies), so there are no credentials for CORS to share.
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate-limit the unauthenticated detection endpoints (see rate_limit.py for
# why and for the per-endpoint limits). RATE_LIMIT_DISABLED=1 switches it off
# for tests and local development.
if os.getenv("RATE_LIMIT_DISABLED") != "1":
    from src.api.rate_limit import RateLimitMiddleware
    app.add_middleware(RateLimitMiddleware)

app.include_router(auth_router)
app.include_router(profile_router)
app.include_router(skin_scan_router)
app.include_router(recommendations_router)
app.include_router(tryon_router)


@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "model_loaded": model is not None,
        "model_path": model_path
    }


@app.get("/health")
async def health():
    """Health check with model status"""
    return {
        "status": "healthy",
        "model_loaded": model is not None,
        "model_path": model_path,
        "confidence_threshold": confidence_threshold
    }


# Directory model files may be loaded from. Everything outside it is refused:
# .pt files are pickle-based, so YOLO(path) on an attacker-chosen path is a
# code-execution primitive, and per-path error messages would double as a
# filesystem-probing oracle on an unauthenticated endpoint.
MODELS_DIR = (Path(__file__).resolve().parents[2] / "models").resolve()


def _require_admin_endpoints() -> None:
    """/load-model and /set-confidence are dev tools no app screen calls, yet
    they mutate global state for every user (swap the served model, change
    the detection threshold). Least privilege: they only exist when
    ADMIN_ENDPOINTS_ENABLED=1 is set, and answer 404 (not 403) otherwise so
    their presence isn't advertised."""
    if os.getenv("ADMIN_ENDPOINTS_ENABLED") != "1":
        raise HTTPException(status_code=404, detail="Not Found")


@app.post("/load-model")
async def load_model_endpoint(data: dict):
    """Load a YOLO model from a .pt file inside the models/ directory."""
    _require_admin_endpoints()
    model_file = data.get("model_file")
    if not model_file:
        raise HTTPException(status_code=400, detail="model_file is required")

    requested = (MODELS_DIR / model_file).resolve() if not os.path.isabs(model_file) \
        else Path(model_file).resolve()
    # Path.is_relative_to also rejects ../ traversal after resolution.
    if not requested.is_relative_to(MODELS_DIR) or requested.suffix != ".pt":
        # Deliberately generic: don't confirm or deny anything about paths
        # outside the allowed directory.
        raise HTTPException(status_code=400, detail="model_file must be a .pt file inside the models directory")

    if not requested.exists():
        raise HTTPException(status_code=404, detail="Model file not found in the models directory")

    try:
        load_model(str(requested))
        return {
            "status": "success",
            "message": f"Model loaded: {requested.name}",
            "model_path": model_path,
        }
    except Exception:
        # Loader errors can embed absolute paths; keep them out of responses.
        raise HTTPException(status_code=400, detail="Model file could not be loaded")



@app.post("/detect")
async def detect_products(
    image: UploadFile = File(...),
    confidence: float = 0.25,
):
    # Same bounds /set-confidence enforces -- this endpoint's own confidence
    # query param previously accepted any float.
    if not 0 < confidence <= 1:
        raise HTTPException(status_code=400, detail="confidence must be between 0 and 1")

    contents = await image.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty image file received")

    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Image exceeds maximum allowed size of {MAX_UPLOAD_SIZE // (1024 * 1024)}MB",
        )

    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        nparr = np.frombuffer(contents, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(status_code=400, detail="Could not decode image")

        image_height, image_width = img.shape[:2]
        results = model(img, conf=confidence, verbose=False)

        detections = []
        for result in results:
            for box in result.boxes:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                conf = float(box.conf[0].cpu().numpy())
                cls_id = int(box.cls[0].cpu().numpy())
                raw_class = result.names[cls_id]
                normalized = normalize_class_name(raw_class)
                display = get_display_name(normalized or raw_class)

                bbox = {
                    "x1": float(x1), "y1": float(y1),
                    "x2": float(x2), "y2": float(y2)
                }

                # ── OCR + Logo detection on the detected product region ──
                ocr_result = await extract_text_from_image_region(
                    contents, bbox, image_width, image_height
                )
                ocr_text, detected_logo = ocr_result if ocr_result else (None, None)
                product_info = parse_product_from_text(
                    ocr_text or "", display or raw_class, detected_logo
                )

                detection = {
                    "class_name": normalized or raw_class,
                    "display_name": product_info.get("display_name") or display,
                    "raw_class_name": raw_class,
                    "confidence": round(conf, 3),
                    "bbox": bbox,
                    # Enriched brand info from OCR
                    "brand": product_info.get("brand"),
                    "product_name": product_info.get("product_name"),
                    "shade": product_info.get("shade"),
                    "ocr_text": ocr_text,
                }
                detections.append(detection)

        return {
            "status": "success",
            "detections": detections,
            "count": len(detections),
            "image_shape": {
                "width": image_width,
                "height": image_height
            }
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    

@app.post("/detect-product-brand")
async def detect_product_brand(
    image: UploadFile = File(...),
    x1: float = 0,
    y1: float = 0,
    x2: float = 0,
    y2: float = 0,
    product_class: str = "",
    image_width: int = 0,
    image_height: int = 0,
):
    """
    Takes the full image + bounding box coordinates from /detect,
    crops the product region, runs OCR, and returns enriched product info.
    """
    contents = await image.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty image file")

    if len(contents) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Image exceeds maximum allowed size of {MAX_UPLOAD_SIZE // (1024 * 1024)}MB",
        )

    bbox = {"x1": x1, "y1": y1, "x2": x2, "y2": y2}

    raw_text = await extract_text_from_image_region(
        contents, bbox, image_width, image_height
    )

    product_info = parse_product_from_text(raw_text or "", product_class)

    return {
        "status": "success",
        "product_class": product_class,
        "ocr_text": raw_text,
        **product_info,
    }
    
@app.post("/detect-with-image")
async def detect_with_annotated_image(
    image: UploadFile = File(...),
    confidence: Optional[float] = None
):
    """
    Detect products and return annotated image with bounding boxes
    
    Returns base64-encoded annotated image
    """
    if model is None:
        raise HTTPException(
            status_code=503,
            detail="Model not loaded. Please load a model first"
        )
    
    try:
        # Read and process image
        image_bytes = await image.read()

        if len(image_bytes) > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail=f"Image exceeds maximum allowed size of {MAX_UPLOAD_SIZE // (1024 * 1024)}MB")

        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image format")
        
        conf_threshold = confidence if confidence is not None else confidence_threshold
        
        # Run inference
        results = model(img, conf=conf_threshold, verbose=False)
        
        # Draw detections on image
        annotated_img = img.copy()
        detections = []
        
        for result in results:
            boxes = result.boxes
            for box in boxes:
                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
                
                conf = float(box.conf[0].cpu().numpy())
                class_id = int(box.cls[0].cpu().numpy())
                raw_class_name = result.names[class_id] if hasattr(result, 'names') else f"Class {class_id}"
                
                # Normalize class name to ProductClass enum
                normalized_class = normalize_class_name(raw_class_name)
                class_name = normalized_class.value if normalized_class else raw_class_name
                display_name = get_display_name(normalized_class) if normalized_class else raw_class_name
                
                if conf >= conf_threshold:
                    # Draw bounding box
                    cv2.rectangle(annotated_img, (x1, y1), (x2, y2), (0, 255, 0), 2)
                    
                    # Draw label using display name
                    label = f"{display_name}: {conf:.2f}"
                    (text_width, text_height), baseline = cv2.getTextSize(
                        label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1
                    )
                    cv2.rectangle(annotated_img, (x1, y1 - text_height - 10),
                                (x1 + text_width, y1), (0, 255, 0), -1)
                    cv2.putText(annotated_img, label, (x1, y1 - 5),
                              cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)
                    
                    detections.append({
                        "class_id": class_id,
                        "class_name": class_name,  # Normalized enum value
                        "display_name": display_name,  # Human-readable name
                        "raw_class_name": raw_class_name,  # Original from model
                        "confidence": round(conf, 4),
                        "bbox": {
                            "x1": float(x1),
                            "y1": float(y1),
                            "x2": float(x2),
                            "y2": float(y2)
                        }
                    })
        
        # Encode annotated image to base64
        _, buffer = cv2.imencode('.jpg', annotated_img)
        import base64
        img_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return {
            "status": "success",
            "detections": detections,
            "count": len(detections),
            "annotated_image": f"data:image/jpeg;base64,{img_base64}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error: {str(e)}")


@app.post("/set-confidence")
async def set_confidence(data: dict):
    """Set global confidence threshold"""
    _require_admin_endpoints()
    global confidence_threshold
    threshold = data.get("threshold")
    if threshold is None:
        raise HTTPException(status_code=400, detail="threshold is required")
    if not 0.0 <= threshold <= 1.0:
        raise HTTPException(status_code=400, detail="Confidence must be between 0.0 and 1.0")
    
    confidence_threshold = threshold
    return {
        "status": "success",
        "confidence_threshold": confidence_threshold
    }


@app.post("/detect-face-mesh")
async def detect_face_mesh(
    image: UploadFile = File(...),
    draw_mesh: bool = False
):
    """
    Detect face mesh landmarks using MediaPipe Face Mesh
    
    Args:
        image: Image file (JPEG, PNG, etc.)
        draw_mesh: If True, return annotated image with mesh drawn
    
    Returns:
        JSON with face mesh landmarks and optionally annotated image
    """
    if not FACE_MESH_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="Face mesh detection is not available. Please install MediaPipe: pip install mediapipe"
        )
    
    try:
        # Read image file
        image_bytes = await image.read()

        if len(image_bytes) > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail=f"Image exceeds maximum allowed size of {MAX_UPLOAD_SIZE // (1024 * 1024)}MB")

        # Convert bytes to numpy array
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            raise HTTPException(status_code=400, detail="Invalid image format")

        # Get face mesh detector
        detector = get_face_mesh_detector()
        
        img_height, img_width = img.shape[:2]

        # Detect face mesh
        face_data = detector.detect_face_mesh(img)

        if face_data is None:
            print("[API] No face detected in image")
            return {
                "status": "success",
                "face_detected": False,
                "message": "No face detected in image",
                "landmarks": [],
                "num_landmarks": 0,
                "bbox": None,
                "image_dimensions": {
                    "width": int(img_width),
                    "height": int(img_height)
                },
                "facial_regions": None
            }
        
        # Get facial regions
        facial_regions = detector.get_facial_regions(face_data)
        
        response = {
            "status": "success",
            "face_detected": True,
            "landmarks": face_data["landmarks"],
            "bbox": face_data["bbox"],
            "num_landmarks": face_data["num_landmarks"],
            "image_dimensions": {
                "width": int(img_width),
                "height": int(img_height)
            },
            "facial_regions": {
                "outer_lip": facial_regions["outer_lip"],
                "inner_lip": facial_regions["inner_lip"],
                "upper_lip": facial_regions["upper_lip"],
                "lower_lip": facial_regions["lower_lip"],
                "left_eye": facial_regions["left_eye"],
                "right_eye": facial_regions["right_eye"],
                "face_oval": facial_regions["face_oval"],
                "left_under_eye": facial_regions.get("left_under_eye", []),
                "right_under_eye": facial_regions.get("right_under_eye", []),
                "around_mouth": facial_regions.get("around_mouth", []),
                "left_eyeshadow": facial_regions.get("left_eyeshadow", []),  # Area above left eye
                "right_eyeshadow": facial_regions.get("right_eyeshadow", []),  # Area above right eye
            }
        }
        
        # Optionally draw mesh on image and return
        if draw_mesh:
            annotated_img = detector.draw_face_mesh(img, face_data)
            _, buffer = cv2.imencode('.jpg', annotated_img)
            import base64
            img_base64 = base64.b64encode(buffer).decode('utf-8')
            response["annotated_image"] = f"data:image/jpeg;base64,{img_base64}"
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Face mesh detection error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
