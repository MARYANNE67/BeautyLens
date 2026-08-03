/**
 * Persists the on-device beauty profile id and the latest completed skin
 * scan id. There's no auth system yet, so a single local profile per device
 * is the MVP model (see plan Phase 1). Saving the scan id means a user who
 * already completed a scan is not asked to redo it every visit -- they can
 * jump straight to their results, and rescan only if they choose to.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_ID_KEY = 'beautylens.profileId';
const SCAN_ID_KEY = 'beautylens.scanId';

export const getLocalProfileId = async (): Promise<number | null> => {
  const stored = await AsyncStorage.getItem(PROFILE_ID_KEY);
  return stored ? Number(stored) : null;
};

export const setLocalProfileId = async (profileId: number): Promise<void> => {
  await AsyncStorage.setItem(PROFILE_ID_KEY, String(profileId));
};

export const getLocalScanId = async (): Promise<number | null> => {
  const stored = await AsyncStorage.getItem(SCAN_ID_KEY);
  return stored ? Number(stored) : null;
};

export const setLocalScanId = async (scanId: number): Promise<void> => {
  await AsyncStorage.setItem(SCAN_ID_KEY, String(scanId));
};

/**
 * Wipes the cached profile/scan ids. Called on sign-out so the next account to
 * log in on this device doesn't inherit the previous user's ids and get 404s
 * from the ownership checks (or, worse, a confusing flash of their results).
 */
export const clearLocalProfile = async (): Promise<void> => {
  await AsyncStorage.multiRemove([PROFILE_ID_KEY, SCAN_ID_KEY]);
};
