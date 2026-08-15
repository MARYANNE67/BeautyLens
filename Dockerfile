# BeautyLens API -- built for Hugging Face Spaces (Docker SDK, port 7860)
# but host-agnostic: any Docker host works with the same image.
FROM python:3.11-slim

# Native deps for OpenCV/mediapipe -- libgl1 matches what CI installs, and
# cv2 additionally needs glib at import time on slim images.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Run as a non-root user; keep everything under its home so all paths stay
# writable. The app dir is created and chowned EXPLICITLY while still root:
# WORKDIR creates missing directories root-owned on classic builders (only
# BuildKit >= Docker 23 chowns them to the active USER), which made an image
# built by Cloud Build fail at runtime with mkdir permission errors while
# the identical Dockerfile worked locally.
RUN useradd -m -u 1000 user && mkdir -p /home/user/app && chown -R user:user /home/user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH
WORKDIR /home/user/app

# CPU-only torch FIRST, from the pytorch CPU wheel index: the default Linux
# wheels bundle CUDA libraries that add gigabytes for a GPU this server does
# not have. Same pinned versions as requirements.txt, so the install below
# sees them as already satisfied.
RUN pip install --no-cache-dir --user \
    torch==2.13.0 torchvision==0.28.0 \
    --index-url https://download.pytorch.org/whl/cpu

COPY --chown=user beautylens/requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

COPY --chown=user beautylens/ .
RUN chmod +x deploy/entrypoint.sh

# DATABASE_PATH is ephemeral by default (documented tradeoff on the free
# tier: the shade catalog reseeds itself at startup, but user profiles and
# scans reset when the container restarts). Point it at a mounted volume if
# persistent storage is attached.
ENV DATABASE_PATH=/home/user/app/beautylens.db \
    MODEL_PATH=/home/user/app/models/final/best.pt \
    MEDIAPIPE_DISABLE_GPU=1

EXPOSE 7860
CMD ["./deploy/entrypoint.sh"]
