import * as SecureStore from "expo-secure-store";

type SessionState = {
  userId: number | null;
  token: string | null;
};

const SESSION_KEY = "finpulse.session";

const sessionState: SessionState = {
  userId: null,
  token: null,
};

export async function initializeSession() {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) {
      return;
    }

    const parsed = JSON.parse(raw) as SessionState;
    sessionState.userId = parsed.userId;
    sessionState.token = parsed.token;
  } catch {
    sessionState.userId = null;
    sessionState.token = null;
  }
}

export async function setSession(userId: number, token: string, remember = false) {
  sessionState.userId = userId;
  sessionState.token = token;

  if (remember) {
    await SecureStore.setItemAsync(
      SESSION_KEY,
      JSON.stringify({
        userId,
        token,
      })
    );
  } else {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }
}

export async function clearSession() {
  sessionState.userId = null;
  sessionState.token = null;
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export function getSessionUserId(): number | null {
  return sessionState.userId;
}

export function getSessionToken(): string | null {
  return sessionState.token;
}
