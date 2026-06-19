# Development

Commands below assume you are starting from the repository root:

```bash
cd /Users/chloe/Desktop/Code/other/SkillCred
```

## Prerequisites

Use Node.js 20.x for the Expo app:

```bash
nvm install 20
nvm use 20
```

The backend requires Python 3.11.

## Install Frontend Dependencies

```bash
cd beautylens
npm install
```

## Install Backend Dependencies

```bash
cd beautylens
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

## Run Backend

The API runs on port `8000`.

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

Check the backend:

```bash
curl http://localhost:8000/health
```

For phone testing, make sure `beautylens/app.json` has `extra.apiBaseUrlDev` set to your computer's LAN IP, for example:

```json
"apiBaseUrlDev": "http://10.0.0.234:8000"
```

## Run Frontend With Expo Go

Use this for normal frontend testing. On-device MediaPipe native face mesh will not run in Expo Go; the app falls back to the FastAPI face mesh endpoint.

```bash
cd beautylens
npx expo start --lan
```

Then scan the QR code with Expo Go.

## Run Frontend With Development Build

Use this for native modules, including the on-device MediaPipe Face Landmarker.
These commands run on your Mac/laptop. Your phone does not need access to the project folder.

Install dev-client:

```bash
cd beautylens
npx expo install expo-dev-client
```

Download the MediaPipe Face Landmarker model:

```bash
cd beautylens
bash scripts/download-face-landmarker-model.sh
```

Generate native projects:

```bash
cd beautylens
npx expo prebuild
```

Build and install on iOS:

```bash
cd beautylens
npx expo run:ios
```

Build and install on a connected iPhone:

```bash
cd beautylens
npx expo run:ios --device
```

If prompted, choose your iPhone from the device list. After installation, open the installed
BeautyLens app on the iPhone. Do not open Expo Go for development-build testing.

Build and install on Android:

```bash
cd beautylens
npx expo run:android
```

Build and install on a connected Android phone:

```bash
cd beautylens
npx expo run:android --device
```

After the development build is installed, start Metro for the dev client:

```bash
cd beautylens
npx expo start --dev-client --lan
```

Open the installed BeautyLens development build on the phone, not Expo Go.

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

Check installed Expo SDK package:

```bash
cd beautylens
node -p "require('./node_modules/expo/package.json').version"
```

## Notes

- Expo Go mode is faster to start, but it cannot load custom native modules.
- Development build mode is required for the local `expo-face-landmarker` native module.
- Product detection still uses the FastAPI YOLO backend.
- Face mesh tries on-device MediaPipe first when available, then falls back to the backend.
