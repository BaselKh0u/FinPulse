import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const TOKEN_KEY = "finpulse_auth_token";
const USER_ID_KEY = "finpulse_user_id";
const WEB_TOKEN = "finpulse_auth_token_web";
const WEB_USER = "finpulse_user_id_web";

/** Device-gated copy so Face ID can restore session after logout when biometric login is on. */
const BIOM_REL_TOKEN = "finpulse_bio_rel_token";
const BIOM_REL_USER = "finpulse_bio_rel_user";
const WEB_BIOM_TOKEN = "finpulse_bio_rel_t_web";
const WEB_BIOM_USER = "finpulse_bio_rel_u_web";

export async function saveSession(token: string, userId: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.multiSet([
      [WEB_TOKEN, token],
      [WEB_USER, userId],
    ]);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  await SecureStore.setItemAsync(USER_ID_KEY, userId);
}

export async function clearSession(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      await AsyncStorage.multiRemove([WEB_TOKEN, WEB_USER]);
      return;
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_ID_KEY);
  } catch {
    // Key may not exist
  }
}

export async function getAccessToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(WEB_TOKEN);
  }
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getStoredUserId(): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(WEB_USER);
  }
  return SecureStore.getItemAsync(USER_ID_KEY);
}

export async function stashSessionForBiometricRelogin(
  token: string,
  userId: string
): Promise<void> {
  if (!token.trim() || !userId.trim()) return;
  if (Platform.OS === "web") {
    await AsyncStorage.multiSet([
      [WEB_BIOM_TOKEN, token],
      [WEB_BIOM_USER, userId],
    ]);
    return;
  }
  await SecureStore.setItemAsync(BIOM_REL_TOKEN, token);
  await SecureStore.setItemAsync(BIOM_REL_USER, userId);
}

export async function getBiometricReloginSession(): Promise<{
  token: string;
  userId: string;
} | null> {
  let token: string | null;
  let userId: string | null;
  if (Platform.OS === "web") {
    token = await AsyncStorage.getItem(WEB_BIOM_TOKEN);
    userId = await AsyncStorage.getItem(WEB_BIOM_USER);
  } else {
    token = await SecureStore.getItemAsync(BIOM_REL_TOKEN);
    userId = await SecureStore.getItemAsync(BIOM_REL_USER);
  }
  if (!token?.trim() || !userId?.trim()) return null;
  return { token, userId };
}

export async function clearBiometricReloginSession(): Promise<void> {
  try {
    if (Platform.OS === "web") {
      await AsyncStorage.multiRemove([WEB_BIOM_TOKEN, WEB_BIOM_USER]);
      return;
    }
    await SecureStore.deleteItemAsync(BIOM_REL_TOKEN);
    await SecureStore.deleteItemAsync(BIOM_REL_USER);
  } catch {
    // keys may not exist
  }
}
