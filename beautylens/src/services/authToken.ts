/**
 * Bridges the auth layer and the API layer without a circular import:
 * AuthContext registers a token getter here, and api.ts reads it.
 *
 * The getter delegates to Firebase's getIdToken(), which returns the cached
 * token and transparently refreshes it when it's within ~5 minutes of expiry,
 * so callers never have to think about token lifetime.
 */
type TokenGetter = () => Promise<string | null>;

let tokenGetter: TokenGetter | null = null;

export const registerTokenGetter = (getter: TokenGetter | null): void => {
  tokenGetter = getter;
};

export const getIdToken = async (): Promise<string | null> => {
  if (!tokenGetter) return null;
  try {
    return await tokenGetter();
  } catch {
    return null;
  }
};

/**
 * Authorization header for authenticated endpoints. Returns an empty object
 * when signed out so callers still produce a valid (if unauthorized) request
 * and get the backend's 401 rather than throwing locally.
 */
export const authHeaders = async (): Promise<Record<string, string>> => {
  const token = await getIdToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
