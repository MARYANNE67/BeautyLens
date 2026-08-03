"""
Realistic, photo-based shade preview. Deliberately separate from the
existing live AR overlay (/detect-face-mesh + camera.tsx + meshOverlays.ts)
-- that flow is untouched. See src/api/tryon_render.py for the blending
technique.
"""
import base64

import cv2
import numpy as np
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from src.api.db import get_db
from src.api.firebase_auth import FirebaseUser, get_current_user
from src.api.models_db import ShadeProduct
from src.api.tryon_render import apply_shade_preview

router = APIRouter(prefix="/tryon", tags=["tryon"])

MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB, matches main.py's limit


@router.post("/preview")
async def preview_shade(
    shade_id: int = Form(...),
    image: UploadFile = File(...),
    user: FirebaseUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Blend a catalog shade's color into the relevant face region of a
    single captured photo and return the composited image.
    """
    shade = db.get(ShadeProduct, shade_id)
    if shade is None:
        raise HTTPException(status_code=404, detail="Shade not found")

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image file received")
    if len(image_bytes) > MAX_UPLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Image exceeds maximum allowed size of {MAX_UPLOAD_SIZE // (1024 * 1024)}MB",
        )

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image format - could not decode image")

    result = apply_shade_preview(img, shade.category, shade.lab_a, shade.lab_b, shade.coverage, shade.finish)
    if result is None:
        raise HTTPException(status_code=422, detail="No face detected. Please retake the photo.")

    _, buffer = cv2.imencode(".jpg", result)
    preview_b64 = base64.b64encode(buffer).decode("utf-8")

    return {
        "status": "success",
        "shade_id": shade.id,
        "category": shade.category,
        "preview_image": f"data:image/jpeg;base64,{preview_b64}",
    }
