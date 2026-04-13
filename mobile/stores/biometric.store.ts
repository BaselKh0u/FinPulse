import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "finpulse_biometric_enabled";

export async function isBiometricEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem(KEY);
  return val === "true";
}

export async function setBiometricEnabled(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(KEY, enabled ? "true" : "false");
}
