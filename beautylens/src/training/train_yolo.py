# src/training/train_yolo.py

from pathlib import Path
from ultralytics import YOLO
import shutil

IMG_SIZE = 640
EPOCHS = 50
BATCH_SIZE = 8
MODEL_WEIGHTS = "yolov8s.pt"

RUN_NAME = "makeup-yolov8n-preprocessed-aug"
PROJECT_NAME = "sea710_yolo_runs"


def get_paths():
    this_file = Path(__file__).resolve()
    root = this_file.parents[2]

    data_yaml = root / "dataset" / "data_preprocessed.yaml"
    if not data_yaml.exists():
        raise FileNotFoundError(f"Could not find data yaml at: {data_yaml}")

    project_dir = root / "runs" / PROJECT_NAME
    project_dir.mkdir(parents=True, exist_ok=True)

    models_final_dir = root / "models" / "final"
    models_final_dir.mkdir(parents=True, exist_ok=True)

    return root, data_yaml, project_dir, models_final_dir


def train():
    root, data_yaml, project_dir, models_final_dir = get_paths()

    print("=== YOLOv8 Training Config ===")
    print(f"Project root:        {root}")
    print(f"Data YAML:           {data_yaml}")
    print(f"Model weights:       {MODEL_WEIGHTS}")
    print(f"Image size:          {IMG_SIZE}")
    print(f"Epochs:              {EPOCHS}")
    print(f"Batch size:          {BATCH_SIZE}")
    print(f"Project dir (runs/): {project_dir}")
    print(f"Run name:            {RUN_NAME}")
    print("==============================")

    model = YOLO(MODEL_WEIGHTS)

    # Train
    model.train(
        data=str(data_yaml),
        imgsz=IMG_SIZE,
        epochs=EPOCHS,
        batch=BATCH_SIZE,
        project=str(project_dir),
        patience =20, #at 20 epochs if no improvement stop early 
        name=RUN_NAME,
        workers=4,
        pretrained=True,
        exist_ok=True,
    )

    # ---- Export best checkpoint to models/final/ ----
    run_dir = project_dir / RUN_NAME
    weights_dir = run_dir / "weights"
    best_ckpt = weights_dir / "best.pt"

    if best_ckpt.exists():
        target_path = models_final_dir / "makeup-yolov8s-preprocessed-aug.pt"
        shutil.copy2(best_ckpt, target_path)
        print(f"[INFO] Exported best model to: {target_path}")
    else:
        print(f"[WARN] best.pt not found at {best_ckpt}, skipping export.")


if __name__ == "__main__":
    train()