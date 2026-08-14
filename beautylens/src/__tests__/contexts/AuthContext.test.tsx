/**
 * AuthContext tests, centred on a regression that shipped once already:
 *
 * updateDisplayName() must refresh the `user` state with an object that
 * KEEPS the Firebase User prototype. Firebase's UserImpl defines
 * getIdToken/reload on its prototype, not as own properties, so an earlier
 * implementation using a plain `{ ...currentUser }` spread silently dropped
 * them — the token getter registered with services/authToken then threw on
 * every call, was swallowed, and every authenticated request after a name
 * edit went out with no Authorization header (surfacing as backend 401s).
 *
 * services/authToken is deliberately NOT mocked: the assertions go through
 * the real registered getter, exactly like api.ts does in production.
 */
import React from 'react';
import { Text } from 'react-native';
import { render, screen, act, fireEvent } from '@testing-library/react-native';

import { getIdToken, authHeaders } from '../../services/authToken';

// ── Module mocks ─────────────────────────────────────────────────────────────

let authStateCallback: ((user: unknown) => void) | null = null;
const mockAuth: { currentUser: FakeFirebaseUser | null } = { currentUser: null };

jest.mock('../../config/firebase', () => ({
  getFirebaseAuth: jest.fn(() => mockAuth),
  requireFirebaseAuth: jest.fn(() => mockAuth),
  isFirebaseConfigured: true,
  FIREBASE_SETUP_HINT: 'setup hint',
}));

jest.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: jest.fn(),
  onAuthStateChanged: jest.fn((_auth: unknown, cb: (user: unknown) => void) => {
    authStateCallback = cb;
    return jest.fn(); // unsubscribe
  }),
  sendPasswordResetEmail: jest.fn(),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
  // Firebase mutates the user in place; mirror that.
  updateProfile: jest.fn(async (user: { displayName?: string }, { displayName }: { displayName: string }) => {
    user.displayName = displayName;
  }),
}));

jest.mock('../../services/api', () => ({
  createSession: jest.fn(async () => ({ profile_id: 1, profile_origin: 'created' })),
}));

jest.mock('../../utils/profileStorage', () => ({
  clearLocalProfile: jest.fn(),
  getLocalProfileId: jest.fn(async () => null),
  setLocalProfileId: jest.fn(),
}));

/**
 * Mirrors the shape that matters about Firebase's UserImpl: getIdToken lives
 * on the PROTOTYPE. Any state refresh that copies own properties only (a
 * spread) produces an object where `user.getIdToken` is undefined.
 */
class FakeFirebaseUser {
  displayName = 'Old Name';
  email = 'user@example.com';
  emailVerified = true;

  getIdToken(): Promise<string> {
    return Promise.resolve(`token-for-${this.displayName}`);
  }
}

// Imported AFTER the mocks so AuthContext binds to them.
import { AuthProvider, useAuth } from '../../contexts/AuthContext';

function Consumer() {
  const { user, updateDisplayName } = useAuth();
  return (
    <Text testID="name" onPress={() => updateDisplayName('New Name')}>
      {user?.displayName ?? 'signed-out'}
    </Text>
  );
}

async function renderSignedIn() {
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  );
  const fakeUser = new FakeFirebaseUser();
  mockAuth.currentUser = fakeUser;
  await act(async () => {
    authStateCallback?.(fakeUser);
  });
  return fakeUser;
}

afterEach(() => {
  authStateCallback = null;
  mockAuth.currentUser = null;
});

describe('token getter registration', () => {
  it('serves tokens through the registered getter once signed in', async () => {
    await renderSignedIn();
    expect(await getIdToken()).toBe('token-for-Old Name');
    expect(await authHeaders()).toEqual({ Authorization: 'Bearer token-for-Old Name' });
  });

  it('returns no token when signed out', async () => {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await act(async () => {
      authStateCallback?.(null);
    });
    expect(await getIdToken()).toBeNull();
    expect(await authHeaders()).toEqual({});
  });
});

describe('updateDisplayName', () => {
  it('updates the rendered display name', async () => {
    await renderSignedIn();
    expect(screen.getByTestId('name')).toHaveTextContent('Old Name');
    await act(async () => {
      fireEvent.press(screen.getByTestId('name'));
    });
    expect(screen.getByTestId('name')).toHaveTextContent('New Name');
  });

  it('REGRESSION: auth keeps working after a name edit', async () => {
    // With the old `{ ...currentUser }` spread, the refreshed user object
    // lost its prototype, user.getIdToken threw, authToken swallowed the
    // error, and this returned null — no Authorization header on any
    // request after the edit.
    await renderSignedIn();
    await act(async () => {
      fireEvent.press(screen.getByTestId('name'));
    });
    expect(await getIdToken()).toBe('token-for-New Name');
    expect(await authHeaders()).toEqual({ Authorization: 'Bearer token-for-New Name' });
  });
});
