/**
 * Firebase client setup.
 *
 * Uses the Firebase JS SDK rather than @react-native-firebase on purpose: this
 * app is managed Expo with no android/ or ios/ folders, so the JS SDK is the
 * only option that runs in Expo Go without a native build.
 *
 * Config comes from EXPO_PUBLIC_* env vars (see .env.example). These are
 * inlined into the bundle at build time, which is fine and expected -- Firebase
 * web config values are not secrets. What actually protects your data is the
 * backend verifying the ID token (src/api/firebase_auth.py) plus Firebase
 * security rules, never the config being hidden.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  type Auth,
  type Persistence,
} from 'firebase/auth';

/**
 * getReactNativePersistence ships in @firebase/auth's react-native entry point,
 * which Metro resolves at runtime, but the package's default .d.ts (the one
 * tsc picks) doesn't declare it. The require here is the documented workaround;
 * it keeps the untyped access in exactly one place instead of scattering
 * @ts-expect-error across the auth code.
 */
const getReactNativePersistence: (storage: typeof AsyncStorage) => Persistence =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('firebase/auth').getReactNativePersistence;

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

/** The three values sign-in genuinely cannot work without. */
export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.appId
);

export const FIREBASE_SETUP_HINT =
  'Firebase is not configured. Copy .env.example to .env and fill in the ' +
  'EXPO_PUBLIC_FIREBASE_* values from Firebase Console > Project settings > ' +
  'Your apps > Web app, then restart Expo with `npx expo start -c`.';

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

function ensureInitialised(): { app: FirebaseApp; auth: Auth } | null {
  if (!isFirebaseConfigured) return null;
  if (app && auth) return { app, auth };

  app = getApps().length ? getApp() : initializeApp(firebaseConfig);

  try {
    // initializeAuth wires AsyncStorage persistence so the session survives an
    // app restart. Without it the SDK falls back to in-memory persistence and
    // the user is silently signed out every cold start.
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Already initialised (Fast Refresh re-runs this module) -- reuse it.
    auth = getAuth(app);
  }

  return { app, auth };
}

/** Returns the Auth instance, or null when Firebase config is missing. */
export function getFirebaseAuth(): Auth | null {
  return ensureInitialised()?.auth ?? null;
}

/** Same, but throws a setup-hint error -- for call sites that cannot proceed. */
export function requireFirebaseAuth(): Auth {
  const instance = getFirebaseAuth();
  if (!instance) throw new Error(FIREBASE_SETUP_HINT);
  return instance;
}
