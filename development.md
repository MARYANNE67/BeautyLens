# Development

Run these commands from the repository root unless noted otherwise:

```bash
cd /Users/chloe/Desktop/Code/other/SkillCred
```

## Prerequisites

Use Node.js 20.x for the Expo app:

```bash
nvm install 20
nvm use 20
```

Use Python 3.11 for the backend.

## Frontend Setup

```bash
cd beautylens
npm install
```

## Backend Setup

```bash
cd beautylens
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run Backend

The FastAPI backend runs on port `8000`.

```bash
cd beautylens
source venv/bin/activate
python -m src.api.main
```

Alternative:

```bash
cd beautylens
./start_api.sh
```

Check that the backend is running:

```bash
curl http://localhost:8000/health
```

For phone testing, set `beautylens/app.json` to your computer's LAN IP:

```json
"apiBaseUrlDev": "http://YOUR_COMPUTER_IP:8000"
```

## Run Frontend With Expo Go

Use this for normal frontend testing:

```bash
cd beautylens
npx expo start --lan
```

Scan the QR code with Expo Go.

## Run Frontend With iOS Simulator

```bash
cd beautylens
npx expo run:ios
```

## Run Frontend With Android Emulator

```bash
cd beautylens
npx expo run:android
```

## Run On A Physical Phone

Connect the phone to your computer, then run one of:

```bash
cd beautylens
npx expo run:ios --device
```

```bash
cd beautylens
npx expo run:android --device
```

Then start Metro:

```bash
cd beautylens
npx expo start --lan
```

Open the installed BeautyLens app on the phone, or scan the QR with Expo Go if using Expo Go mode.

## Useful Checks

Run lint:

```bash
cd beautylens
npm run lint
```

Run TypeScript check:

```bash
cd beautylens
npx tsc --noEmit
```

Check backend Python syntax:

```bash
cd beautylens
env PYTHONPYCACHEPREFIX=/private/tmp python3 -m py_compile src/api/main.py src/api/face_mesh.py
```

## Notes

- Product detection uses the FastAPI backend.
- AR face mesh currently uses the backend `/detect-face-mesh` endpoint on this branch.
- Restart the backend after changing `src/api/face_mesh.py` or `src/api/main.py`.
- Restart Expo after changing route params or native/app config.
