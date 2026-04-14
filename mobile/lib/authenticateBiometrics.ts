import Constants from "expo-constants";
import * as LocalAuthentication from "expo-local-authentication";
import { Platform } from "react-native";

/** Expo Go runs inside the Expo client binary — strict biometric-only iOS policy fails without that host plist key. */
function useStrictBiometricPolicy(): boolean {
  return Constants.appOwnership !== "expo";
}

export function biometricErrorMessage(error: string | undefined): string {
  switch (error) {
    case "missing_usage_description":
      return "Face ID isn’t set up for this app build. Add NSFaceIDUsageDescription in app.json and use a development or production build (Expo Go can’t use the strict Face ID-only mode).";
    case "not_enrolled":
      return "No Face ID or fingerprint is set up on this device. Add one in system Settings.";
    case "not_available":
      return "Biometrics aren’t available on this device right now.";
    case "lockout":
      return "Biometrics are locked after too many tries. Unlock your phone with your passcode, then try again.";
    case "authentication_failed":
      return "Biometric check didn’t match. Try again.";
    case "user_cancel":
      return "";
    default:
      return error ? `Could not verify (${error}).` : "Could not verify. Try again.";
  }
}

/**
 * Biometric auth. On **standalone / dev builds**, uses `disableDeviceFallback: true` (biometric-first
 * on iOS). On **Expo Go** (`appOwnership === 'expo'`), uses `false` so Face ID works — the Expo Go
 * host app doesn’t satisfy the native module’s NSFaceIDUsageDescription check for the strict policy.
 */
export function authenticateBiometricFirst(
  promptMessage: string
): Promise<LocalAuthentication.LocalAuthenticationResult> {
  const strict = useStrictBiometricPolicy();
  return LocalAuthentication.authenticateAsync({
    promptMessage,
    disableDeviceFallback: strict,
    ...(Platform.OS === "android" && strict ? { cancelLabel: "Cancel" } : {}),
  });
}
