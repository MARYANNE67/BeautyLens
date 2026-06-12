# Makeup Product Detection API

FastAPI backend for makeup product detection using YOLO models.

## Setup

### Install Dependencies

```bash
pip install fastapi uvicorn python-multipart
```

### Run the API Server

```bash
# From project root
python -m src.api.main

# Or using uvicorn directly
uvicorn src.api.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:
- **Local**: http://localhost:8000
- **Network**: http://YOUR_IP:8000 (for mobile testing)

### API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

## Endpoints

### `GET /`
Health check endpoint.

**Response:**
```json
{
  "status": "running",
  "model_loaded": true,
  "model_path": "models/final/best.pt"
}
```

### `GET /health`
Detailed health check with model status.

### `POST /load-model`
Load a YOLO model from file path.

**Body:**
```json
{
  "model_file": "models/final/best.pt"
}
```

### `POST /detect`
Detect makeup products in uploaded image.

**Request:**
- `image`: Image file (multipart/form-data)
- `confidence`: Optional confidence threshold (0.0-1.0)

**Response:**
```json
{
  "status": "success",
  "detections": [
    {
      "class_id": 0,
      "class_name": "lipstick",
      "confidence": 0.85,
      "bbox": {
        "x1": 100.0,
        "y1": 150.0,
        "x2": 200.0,
        "y2": 250.0
      }
    }
  ],
  "count": 1,
  "image_shape": {
    "height": 480,
    "width": 640
  }
}
```

### `POST /detect-with-image`
Detect products and return annotated image with bounding boxes.

**Response includes:**
- `annotated_image`: Base64-encoded JPEG image with bounding boxes drawn

### `POST /set-confidence`
Set global confidence threshold.

**Body:**
```json
{
  "threshold": 0.25
}
```

## Testing with cURL

```bash
# Health check
curl http://localhost:8000/health

# Detect products
curl -X POST "http://localhost:8000/detect?confidence=0.25" \
  -F "image=@path/to/image.jpg"

# Load model
curl -X POST "http://localhost:8000/load-model" \
  -H "Content-Type: application/json" \
  -d '{"model_file": "models/final/best.pt"}'
```

## Mobile App Integration

The API is configured with CORS enabled to allow requests from mobile apps.

**Base URL for mobile app:**
- Development: `http://YOUR_COMPUTER_IP:8000`
- Production: Your deployed server URL

**Example mobile request:**
```javascript
const formData = new FormData();
formData.append('image', {
  uri: imageUri,
  type: 'image/jpeg',
  name: 'photo.jpg',
});

const response = await fetch('http://YOUR_IP:8000/detect?confidence=0.25', {
  method: 'POST',
  body: formData,
});

const data = await response.json();
```

## Notes

- The API automatically loads `models/final/best.pt` on startup if it exists
- Default confidence threshold is 0.25
- Images are processed using OpenCV
- All endpoints return JSON responses



