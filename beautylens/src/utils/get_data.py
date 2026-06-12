# src/utils/get_data.py
import os
from pathlib import Path
from roboflow import Roboflow
from dotenv import load_dotenv 

def download_roboflow_dataset():
    load_dotenv() 
    api_key = os.getenv("ROBOFLOW_API")
    version = 7 #change to the desired version number
    if not api_key:
        raise RuntimeError("Please set ROBOFLOW_API environment variable")

    rf = Roboflow(api_key=api_key)
    project = rf.workspace("sea710-makeup-detection").project("makeup-products-detection-ld6us")
    version = project.version(version)

    # Location: sea710-project/dataset/roboflow
    root = Path(__file__).resolve().parents[2]   # go up from src/utils to project root
    out_dir = root / "dataset" 

    print(f"Downloading dataset to: {out_dir}")
    dataset = version.download("yolov8", location=str(out_dir))

    print("Download complete.")
    print(f"Dataset saved at: {dataset.location}")

if __name__ == "__main__":
    download_roboflow_dataset()