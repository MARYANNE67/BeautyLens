# src/utils/preprocess_yolo.py

from pathlib import Path
from PIL import Image, ImageOps
import shutil

IMG_SIZE = 640          # YOLO size
SPLITS = ["train", "valid", "test"]


def preprocess_image(in_path: Path, out_path: Path):
    """
    Preprocessing:
      - Auto-Orient (EXIF-based)
      - Convert to RGB
      - Resize to 640x640
    """
    img = Image.open(in_path)

    # Auto-Orient (like Roboflow's Auto-Orient)
    img = ImageOps.exif_transpose(img)

    # Ensure RGB
    img = img.convert("RGB")

    # Resize (uniform scaling to square)
    img = img.resize((IMG_SIZE, IMG_SIZE))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="JPEG", quality=95)


def preprocess_split(base_in: Path, base_out: Path, split: str):
    print(f"\n[INFO] Preprocessing split: {split}")
    in_images = base_in / split / "images"
    in_labels = base_in / split / "labels"

    out_images = base_out / split / "images"
    out_labels = base_out / split / "labels"

    if not in_images.exists() or not in_labels.exists():
        print(f"[WARN] Missing split folders for {split}, skipping.")
        return

    out_images.mkdir(parents=True, exist_ok=True)
    out_labels.mkdir(parents=True, exist_ok=True)

    image_files = [
        p for p in in_images.iterdir()
        if p.suffix.lower() in [".jpg", ".jpeg", ".png"]
    ]

    total = len(image_files)
    ok = 0

    for img_path in image_files:
        out_img_name = img_path.stem + ".jpg"
        out_img_path = out_images / out_img_name

        try:
            preprocess_image(img_path, out_img_path)
            ok += 1
        except Exception as e:
            print(f"[ERROR] {img_path.name}: {e}")
            continue

        # Copy label 1:1 (YOLO uses normalized coords, so uniform resize is safe)
        label_name = img_path.stem + ".txt"
        src_label = in_labels / label_name
        dst_label = out_labels / label_name

        if src_label.exists():
            shutil.copy2(src_label, dst_label)
        else:
            print(f"[WARN] Missing label for {img_path.name}")

    print(f"[INFO] Split {split}: processed {ok}/{total} images.")


def preprocess_dataset():
    root = Path(__file__).resolve().parents[2]
    base_in = root / "dataset"
    base_out = root / "dataset" / "preprocessed"

    print(f"[INFO] Input dataset:  {base_in}")
    print(f"[INFO] Output dataset: {base_out}")
    print(f"[INFO] Steps: Auto-Orient + Resize to {IMG_SIZE}x{IMG_SIZE}")

    for split in SPLITS:
        preprocess_split(base_in, base_out, split)

    print("\n[INFO] Basic preprocessing complete.")


if __name__ == "__main__":
    preprocess_dataset()