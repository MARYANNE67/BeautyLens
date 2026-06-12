from pathlib import Path
import cv2
import albumentations as A

# How many augmented samples per original image
AUG_PER_IMAGE = 1
IMG_SIZE = 640


def build_transform():
    """
    Very simple, safe Albumentations pipeline:

    - Horizontal flip (50% of images)
    - Light brightness/contrast jitter
    - Light hue/saturation/value jitter
    - Final resize to 640×640
    """
    transform = A.Compose(
        [
            A.HorizontalFlip(p=0.5),

            A.RandomBrightnessContrast(
                brightness_limit=0.10,   # ±10%
                contrast_limit=0.10,
                p=0.3,
            ),

            A.HueSaturationValue(
                hue_shift_limit=10,      # -10..+10
                sat_shift_limit=15,      # ±15
                val_shift_limit=10,      # ±10
                p=0.3,
            ),

            A.Resize(IMG_SIZE, IMG_SIZE),
        ],
        bbox_params=A.BboxParams(
            format="yolo",              # (x_center, y_center, w, h) normalized
            label_fields=["class_labels"],
            min_visibility=0.3,
        ),
    )
    return transform


def load_yolo_labels(label_path: Path):
    """
    Read YOLO label file: each line is:
    <class> <x_center> <y_center> <w> <h>
    class can be '7' or '7.0' -> we cast safely with int(float(...)).
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

            cls = int(float(parts[0]))  # handles "7" and "7.0"
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


def augment_train_split(root: Path | None = None):
    """
    Augment dataset/preprocessed/train/images and labels in-place
    by adding extra *_augX.jpg images + labels.

    Works both in a .py file and in a Jupyter/Colab notebook.
    """
    # If root not provided, infer it
    if root is None:
        try:
            # works when this code is in a .py file
            root = Path(__file__).resolve().parents[2]
        except NameError:
            # we're in a notebook; assume CWD is project root (after %cd SEA710_Ass)
            root = Path.cwd().resolve()

    images_dir = root / "dataset" / "preprocessed" / "train" / "images"
    labels_dir = root / "dataset" / "preprocessed" / "train" / "labels"

    if not images_dir.exists() or not labels_dir.exists():
        raise FileNotFoundError(f"Train set not found under {images_dir} / {labels_dir}")

    print(f"[INFO] Augmenting images in: {images_dir}")
    transform = build_transform()

    # ⚠️ Skip already-augmented files like *_aug1.jpg
    image_files = sorted(
        [
            p for p in images_dir.iterdir()
            if p.suffix.lower() in [".jpg", ".jpeg", ".png"]
            and "_aug" not in p.stem
        ]
    )

    total = len(image_files)
    print(f"[INFO] Found {total} original training images to augment")

    for img_idx, img_path in enumerate(image_files, start=1):
        label_path = labels_dir / (img_path.stem + ".txt")
        bboxes, class_labels = load_yolo_labels(label_path)

        if not bboxes:
            print(f"[WARN] No labels for {img_path.name}, skipping.")
            continue

        image = cv2.imread(str(img_path))
        if image is None:
            print(f"[WARN] Could not read {img_path}, skipping.")
            continue

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
                # all boxes got dropped (rare with simple aug)
                continue

            aug_img_bgr = cv2.cvtColor(aug_img, cv2.COLOR_RGB2BGR)

            new_stem = f"{img_path.stem}_aug{aug_i+1}"
            new_img_path = images_dir / f"{new_stem}.jpg"
            new_label_path = labels_dir / f"{new_stem}.txt"

            cv2.imwrite(str(new_img_path), aug_img_bgr)
            save_yolo_labels(new_label_path, aug_bboxes, aug_labels)

        if img_idx % 50 == 0:
            print(f"[INFO] Processed {img_idx}/{total} images...")

    print("[INFO] Augmentation complete.")


if __name__ == "__main__":
    augment_train_split()