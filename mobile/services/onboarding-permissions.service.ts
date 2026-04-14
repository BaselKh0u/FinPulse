import * as ImagePicker from "expo-image-picker";
import { registerForPushNotifications } from "@/services/notification.service";

/**
 * Best-effort OS permission prompts after a new account is created.
 * Order: notifications → photo library → camera (each may show a system sheet).
 * Face ID / Touch ID is requested the first time the user enables “Biometric login” in Profile
 * (LocalAuthentication has no separate pre-prompt API).
 */
export async function runPostRegistrationPermissionPrompts(): Promise<void> {
  try {
    await registerForPushNotifications({ silent: false });
  } catch {
    // Expo Go / simulator — non-fatal
  }

  try {
    await ImagePicker.requestMediaLibraryPermissionsAsync();
  } catch {
    // ignore
  }

  try {
    await ImagePicker.requestCameraPermissionsAsync();
  } catch {
    // ignore
  }
}
