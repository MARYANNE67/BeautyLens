# Image Augmentation Pipeline (Simplified)

This document describes the **image augmentation** steps used in the SEA710 Makeup Product Detection Project, **after preprocessing and before YOLOv8 training**, using the **simplified augmentation pipeline**.

Augmentation is applied **only to the training split** of the **preprocessed** dataset to increase data diversity while keeping all images visually realistic and bounding boxes reliable.

---

## 1. Overview

Augmentation is handled by a dedicated script:

- **Script:** `src/training/augment_yolo_train.py` (or equivalent augmentation script)
- **Function:** `augment_train_split()`

This script:

- Loads **preprocessed** images and YOLO labels from:
  - `dataset/preprocessed/train/images`
  - `dataset/preprocessed/train/labels`
- Applies a **minimal, safe set** of augmentations using **Albumentations**
- Writes **new augmented images + labels** back into the same folders with `_augX` suffixes

Example filenames:

- Original: `photo-123.jpg`, `photo-123.txt`
- Augmented: `photo-123_aug1.jpg`, `photo-123_aug1.txt`

The script automatically **skips files that are already augmented** (e.g. `*_aug1.jpg`) to avoid augmenting the same images multiple times.

---

## 2. Augmentation Scope

Augmentation is **only applied to**:

- `dataset/preprocessed/train/images`
- `dataset/preprocessed/train/labels`

Validation and test sets remain **unchanged** to ensure fair evaluation.

### 2.1 Augmentation Factor

In the script:

```python
AUG_PER_IMAGE = 1
```

- For **each original training image** (non-augmented file), the pipeline generates **1 augmented copy** (if at least one bounding box survives the transforms).
- Example:
  - If the preprocessed train set has **2715** original images, augmentation aims to create up to **2715 new images**, for a total of **≈ 5430** training images.

The script filters files so that only stems **without** `"_aug"` are treated as original images:

```python
image_files = sorted(
    [
        p for p in images_dir.iterdir()
        if p.suffix.lower() in [".jpg", ".jpeg", ".png"]
        and "_aug" not in p.stem
    ]
)
```

This ensures idempotent behavior: running the script multiple times will not keep creating more and more augmented copies of the same images.

---

## 3. Bounding Box Format and Handling

Augmentations are implemented with **Albumentations** and operate in **YOLO format** for bounding boxes:

- Format: `(x_center, y_center, width, height)`
- Coordinates: **normalized** to `[0, 1]`

Labels are loaded from `.txt` files with lines of the form:

```text
<class_id> <x_center> <y_center> <width> <height>
```

Example loader:

```python
def load_yolo_labels(label_path: Path):
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
```

After augmentation, boxes are written back in the same YOLO format:

```python
def save_yolo_labels(label_path: Path, bboxes, class_labels):
    label_path.parent.mkdir(parents=True, exist_ok=True)
    with open(label_path, "w") as f:
        for bbox, cls in zip(bboxes, class_labels):
            x_center, y_center, w, h = bbox
            f.write(f"{cls} {x_center:.6f} {y_center:.6f} {w:.6f} {h:.6f}
")
```

Bounding boxes are managed inside Albumentations with:

```python
bbox_params = A.BboxParams(
    format="yolo",
    label_fields=["class_labels"],
    min_visibility=0.3,
)
```

- Boxes with visibility `< 0.3` are dropped.
- This keeps annotations reasonable after flips and color transforms.

If all bounding boxes are dropped for a given augmented sample, that sample is **skipped** and not saved.

---

## 4. Simplified Augmentation Transforms

The augmentation pipeline (`build_transform()`) is intentionally **minimal and safe** to avoid distorting objects or creating unrealistic images. It focuses on:

- Simple **horizontal flipping**
- Light **brightness/contrast** changes
- Light **color (HSV)** shifts
- Final **resize** to the desired model input size

### 4.1 Transform Pipeline

```python
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
            # 1) Horizontal flip
            A.HorizontalFlip(p=0.5),

            # 2) Light brightness/contrast
            A.RandomBrightnessContrast(
                brightness_limit=0.10,  # ±10%
                contrast_limit=0.10,
                p=0.3,
            ),

            # 3) Light color jitter (Hue/Saturation/Value)
            A.HueSaturationValue(
                hue_shift_limit=10,    # -10..+10 degrees
                sat_shift_limit=15,    # ±15
                val_shift_limit=10,    # ±10
                p=0.3,
            ),

            # 4) Final resize to YOLO input size
            A.Resize(IMG_SIZE, IMG_SIZE),
        ],
        bbox_params=A.BboxParams(
            format="yolo",              # (x_center, y_center, w, h) normalized
            label_fields=["class_labels"],
            min_visibility=0.3,
        ),
    )
    return transform
```

### 4.2 Rationale for Simplification

We **removed** heavier geometric and photometric transforms such as:

- Large random crops / random resized crops  
- Strong rotations or perspective transforms  
- Strong blur and heavy noise  
- Aggressive gamma/contrast changes  

These were removed because they sometimes produced:

- **Noisy, unrealistic images**
- **Poorly aligned bounding boxes**
- Cases where objects were partially cut off, making training labels unreliable

The simplified pipeline is designed to:

- Keep objects clearly visible and well-framed  
- Preserve original geometry (no rotation, shear, or crop)  
- Introduce just enough variation to improve generalization:
  - Left–right orientation changes  
  - Mild lighting and color variation  

This is a good match for product detection where packaging and shape must remain recognizable.

---

## 5. Augmentation Script Flow

The main function `augment_train_split()` orchestrates the process:

```python
def augment_train_split(root: Path | None = None):
    """
    Augment dataset/preprocessed/train/images and labels in-place
    by adding extra *_augX.jpg images + labels.

    Works both in a .py file and in a Jupyter/Colab notebook.
    """
    # 1) Infer project root if not provided
    if root is None:
        try:
            # When running as a .py file
            root = Path(__file__).resolve().parents[2]
        except NameError:
            # When running inside a notebook (after %cd SEA710_Ass)
            root = Path.cwd().resolve()

    images_dir = root / "dataset" / "preprocessed" / "train" / "images"
    labels_dir = root / "dataset" / "preprocessed" / "train" / "labels"

    if not images_dir.exists() or not labels_dir.exists():
        raise FileNotFoundError(f"Train set not found under {images_dir} / {labels_dir}")

    print(f"[INFO] Augmenting images in: {images_dir}")
    transform = build_transform()

    # 2) Collect only original images (skip already-augmented ones)
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

        # Convert BGR (OpenCV) -> RGB (Albumentations)
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
                # All boxes dropped (rare with this simple pipeline)
                continue

            # Convert back to BGR for saving
            aug_img_bgr = cv2.cvtColor(aug_img, cv2.COLOR_RGB2BGR)

            new_stem = f"{img_path.stem}_aug{aug_i+1}"
            new_img_path = images_dir / f"{new_stem}.jpg"
            new_label_path = labels_dir / f"{new_stem}.txt"

            cv2.imwrite(str(new_img_path), aug_img_bgr)
            save_yolo_labels(new_label_path, aug_bboxes, aug_labels)

        if img_idx % 50 == 0:
            print(f"[INFO] Processed {img_idx}/{total} images...")

    print("[INFO] Augmentation complete.")
```

---

## 6. Running the Augmentation Script

From the **project root** (e.g., `SEA710_Ass/`), run:

```bash
python -m src.training.augment_yolo_train
```

or, if the script file is named differently:

```bash
python src/training/augment_yolo_train.py
```

What the script does:

1. Resolves the project root.  
2. Locates:
   - `dataset/preprocessed/train/images`
   - `dataset/preprocessed/train/labels`
3. Iterates only over **non-augmented** training images.  
4. For each image:
   - Loads the image and its YOLO `.txt` label file
   - Applies the Albumentations pipeline `AUG_PER_IMAGE` times
   - Saves:
     - Augmented image as `*_augX.jpg`
     - Augmented labels as `*_augX.txt`
5. Logs progress every 50 images.  
6. Skips images with:
   - Missing labels
   - Failed image reads
   - Augmented samples where all bounding boxes are lost  

---

## 7. Using the Augmented Dataset for YOLOv8 Training

After augmentation, the **training images directory** contains:

- Original preprocessed images: `*.jpg`  
- Augmented images: `*_aug1.jpg` (and more if `AUG_PER_IMAGE > 1`)  

Training uses a YOLO data config YAML that points to the **preprocessed** dataset, e.g.:

```yaml
# dataset/data_preprocessed.yaml

path: ../dataset/preprocessed

train: train/images
val: val/images
test: test/images

names:
  0: beauty_blender
  1: blush
  2: bronzer
  3: brush
  4: concealer
  5: eye_liner
  6: eye_shadow
  7: eyelash_curler
  8: foundation
  9: highlighter
  10: lip_balm
  11: lip_gloss
  12: lip_liner
  13: lip_stick
  14: mascara
  15: nail_polish
  16: powder
  17: primer
  18: setting_spray
```

Because augmented images are stored in the **same directory** as the original training images, they are automatically included in training without any changes to the YAML file.

---

## 8. Summary

- The Roboflow dataset is first downloaded and converted to YOLO format.  
- All images are **preprocessed** (auto-orient, RGB, resize to 640×640) into `dataset/preprocessed/...`.  
- A **simplified augmentation pipeline** is applied only to the **train** split using Albumentations.  
- The script:
  - Generates up to `AUG_PER_IMAGE` new images per original  
  - Keeps bounding boxes in YOLO format and drops low-visibility boxes  
  - Skips already-augmented images using the `"_aug"` naming convention  
- YOLOv8 training uses the combined original + augmented dataset via `data_preprocessed.yaml`.

This setup cleanly separates:

- **Preprocessing:** deterministic, one-time image cleaning and resizing  
- **Augmentation:** minimal, realistic training-data expansion for better generalization without noisy artifacts.
