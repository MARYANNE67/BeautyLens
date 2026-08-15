"""
Download deployment artifacts (YOLO weights + shade catalog) from the
Hugging Face model repo named by HF_MODEL_REPO.

Both files are deliberately not in git -- the weights exceed the repo's
size policy (CI enforces no .pt over 5MB) and the catalog is regenerable
from a public dataset -- so a fresh server has neither. Versioning them in
an HF model repo keeps model artifacts separate from code, and this script
fetches them once at container start (see entrypoint.sh, which skips it
when both files already exist).

Required env:
  HF_MODEL_REPO  e.g. "your-username/beautylens-artifacts"
Optional env:
  HF_TOKEN       only if the artifact repo is private
  MODEL_PATH     defaults to models/final/best.pt
"""
import os
import shutil
from pathlib import Path

from huggingface_hub import hf_hub_download

repo = os.environ["HF_MODEL_REPO"]
token = os.getenv("HF_TOKEN")

targets = {
    "best.pt": Path(os.getenv("MODEL_PATH", "models/final/best.pt")),
    "shade_catalog_seed.json": Path("data/shade_catalog_seed.json"),
}

for filename, dest in targets.items():
    if dest.exists():
        print(f"[deploy] {dest} already present, skipping")
        continue
    dest.parent.mkdir(parents=True, exist_ok=True)
    fetched = hf_hub_download(repo_id=repo, filename=filename, token=token)
    shutil.copy(fetched, dest)
    print(f"[deploy] fetched {filename} -> {dest}")
