## Setup Requirements

### Node Version
This project requires **Node.js 20.x**. Newer versions (22+) break Expo's config plugin resolver.

```bash
nvm install 20
nvm use 20
```

### Expo SDK
This project is pinned to **Expo SDK 54** to match the version currently supported by Expo Go on the iOS App Store.

### Python / Backend
Requires **Python 3.11**. MediaPipe is pinned to `0.10.9` — newer versions break the `mediapipe.solutions` API.