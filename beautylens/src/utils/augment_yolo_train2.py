import os
from pathlib import Path
import cv2
import albumentations as A

# How many augmented samples per original image
# 1 = medium speed, good accuracy
# 2 = slower, more data
AUG_PER_IMAGE = 1

IMG_SIZE = 640  # keep consistent with YOLO training


def build_transform():
    """
    Albumentations pipeline (simplified & realistic for makeup products):

    - Horizontal flip (0.5)
    - Mild random crop/zoom (scale 0.9–1.0)
    - Small rotation: [-15°, +15°]
    - Mild shear: ±5° horizontal/vertical
    - Color / light tweaks (hue, saturation, brightness, contrast, gamma)
    - Mild blur + noise
    - Final resize to 640×640
    """
    transform = A.Compose(
        [
            # Geometric
            A.HorizontalFlip(p=0.5),

            A.RandomResizedCrop(
                height=IMG_SIZE,
                width=IMG_SIZE,
                scale=(0.9, 1.0),  # gentler zoom/crop
                ratio=(0.9, 1.1),
                p=0.5,
            ),

            A.SafeRotate(
                limit=15,  # -15° to +15°
                border_mode=cv2.BORDER_REFLECT_101,
                p=0.7,
            ),

            A.Affine(
                shear={"x": (-5, 5), "y": (-5, 5)},
                mode=cv2.BORDER_REFLECT_101,
                p=0.5,
            ),

            # Color / intensity
            A.HueSaturationValue(
                hue_shift_limit=15,
                sat_shift_limit=25,
                val_shift_limit=15,
                p=0.7,
            ),
            A.RandomBrightnessContrast(
                brightness_limit=0.15,
                contrast_limit=0.15,
                p=0.7,
            ),
            A.RandomGamma(
                gamma_limit=(90, 110),  # ~ -10% to +10% exposure
                p=0.5,
            ),

            # Blur & noise
            A.GaussianBlur(
                blur_limit=(1, 3),
                p=0.3,
            ),
            A.GaussNoise(
                var_limit=(5.0, 20.0),
                p=0.3,
            ),

            # Ensure final size
            A.Resize(IMG_SIZE, IMG_SIZE),
        ],
        bbox_params=A.BboxParams(
            format="yolo",              # (x_center, y_center, w, h), normalized
            label_fields=["class_labels"],
            min_visibility=0.3,
        )
    )
    return transform


def load_yolo_labels(label_path: Path):
    """
    Read YOLO label file: each line is
    <class> <x_center> <y_center> <w> <h> (all floats except class)
    """
    if not label_path.exists():
        return [], []

    bboxes = []
    class_labels = []
    with open(label_path, "r") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) != 5:
                continue
            cls = int(parts[0])
            x_center, y_center, w, h = map(float, parts[1:])
            bboxes.append([x_center, y_center, w, h])
            class_labels.append(cls)
    return bboxes, class_labels


def save_yolo_labels(label_path: Path, bboxes, class_labels):
    """
    Write YOLO labels back to .txt file.
    """
    label_path.parent.mkdir(parents=True, exist_ok=True)
    with open(label_path, "w") as f:
        for bbox, cls in zip(bboxes, class_labels):
            x_center, y_center, w, h = bbox
            f.write(f"{cls} {x_center:.6f} {y_center:.6f} {w:.6f} {h:.6f}\n")


def augment_train_split():
    """
    Augment dataset/preprocessed/train/images and labels by
    adding extra *_augX.jpg images + labels.

    IMPORTANT:
    - Assumes you've already run preprocessing so that images are
      640×640, RGB, auto-oriented, under dataset/preprocessed/train.
    """
    root = Path(__file__).resolve().parents[2]

    # If your preprocessed folder is named differently, change here:
    images_dir = root / "dataset" / "preprocessed" / "train" / "images"
    labels_dir = root / "dataset" / "preprocessed" / "train" / "labels"

    if not images_dir.exists() or not labels_dir.exists():
        raise FileNotFoundError(f"Train set not found under {images_dir} / {labels_dir}")

    print(f"[INFO] Augmenting images in: {images_dir}")
    transform = build_transform()

    image_files = sorted(
        [p for p in images_dir.iterdir() if p.suffix.lower() in [".jpg", ".jpeg", ".png"]]
    )

    total = len(image_files)
    print(f"[INFO] Found {total} training images")

    for img_idx, img_path in enumerate(image_files, start=1):
        label_path = labels_dir / (img_path.stem + ".txt")
        bboxes, class_labels = load_yolo_labels(label_path)

        if not bboxes:
            # no labels, skip (or allow background-only if you want)
            print(f"[WARN] No labels for {img_path.name}, skipping.")
            continue

        # read image
        image = cv2.imread(str(img_path))
        if image is None:
            print(f"[WARN] Could not read {img_path}, skipping.")
            continue

        # convert to RGB for Albumentations
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

        for aug_i in range(AUG_PER_IMAGE):
            augmented = transform(
                image=image,
                bboxes=bboxes,
                class_labels=class_labels,
            )

            aug_img = augmented["image"]
            aug_bboxes = augmented["bboxes"]
            aug_labels = augmented["class_labels"]

            if not aug_bboxes:
                # all bboxes got cropped out or became too small/invisible
                continue

            # convert back to BGR for saving with OpenCV
            aug_img_bgr = cv2.cvtColor(aug_img, cv2.COLOR_RGB2BGR)

            # create new filename
            new_stem = f"{img_path.stem}_aug{aug_i+1}"
            new_img_path = images_dir / f"{new_stem}.jpg"
            new_label_path = labels_dir / f"{new_stem}.txt"

            # save image
            cv2.imwrite(str(new_img_path), aug_img_bgr)
            # save labels
            save_yolo_labels(new_label_path, aug_bboxes, aug_labels)

        if img_idx % 50 == 0:
            print(f"[INFO] Processed {img_idx}/{total} images...")

    print("[INFO] Augmentation complete.")


if __name__ == "__main__":
    augment_train_split()