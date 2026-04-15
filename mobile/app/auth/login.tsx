import { login } from "@/services/auth.service";
import { Colors, Fonts } from "@/theme";
import { useTheme } from "@/stores/theme.store";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as LocalAuthentication from "expo-local-authentication";
import * as Haptics from "expo-haptics";
import { authenticateBiometricFirst, biometricErrorMessage } from "@/lib/authenticateBiometrics";
import { isBiometricEnabled } from "@/stores/biometric.store";
import {
  getAccessToken,
  getBiometricReloginSession,
  saveSession,
} from "@/stores/auth.storage";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(createStyles, [isDark]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricType, setBiometricType] = useState<string>("Biometrics");
  const passwordRef = useRef<TextInput>(null);

  useEffect(() => {
    setShowValidation(false);
  }, [email, password]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!compatible || !enrolled || cancelled) return;

      setBiometricAvailable(true);
      const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
      if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
        setBiometricType("Face ID");
      } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
        setBiometricType("Fingerprint");
      }

      const userEnabled = await isBiometricEnabled();
      if (!userEnabled || cancelled) return;
      const token = await getAccessToken();
      const relogin = await getBiometricReloginSession();
      if (!token && !relogin) return;

      const result = await authenticateBiometricFirst("Log in to FinPulse");
      if (cancelled) return;
      if (result.success) {
        if (!token && relogin) {
          await saveSession(relogin.token, relogin.userId);
        }
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.replace("/(tabs)");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only auto biometric; omit router to avoid re-prompts on navigation
  }, []);

  async function onBiometricLogin() {
    const bio = await isBiometricEnabled();
    const token = await getAccessToken();
    const relogin = await getBiometricReloginSession();

    if (!bio) {
      Alert.alert(
        "Biometric login off",
        "Open Profile, sign in with email and password, then turn on Biometric Login."
      );
      return;
    }
    if (!token && !relogin) {
      Alert.alert(
        "Sign in required",
        "Sign in with email and password once, enable Biometric Login in Profile, then you can use Face ID here after logging out."
      );
      return;
    }

    const result = await authenticateBiometricFirst("Log in to FinPulse");

    if (result.success) {
      if (!token && relogin) {
        await saveSession(relogin.token, relogin.userId);
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(tabs)");
    } else if (result.error === "user_cancel") {
      // User cancelled, do nothing
    } else if (result.error === "lockout") {
      Alert.alert(
        "Biometrics locked",
        "Too many failed attempts. Unlock your phone with your device passcode, then try again or use email and password."
      );
    } else {
      const msg = biometricErrorMessage(result.error);
      Alert.alert(
        "Authentication failed",
        msg || "Please try again or use your email and password."
      );
    }
  }

  const trimmedEmail = email.trim();
  const emailInvalid = !EMAIL_REGEX.test(trimmedEmail);
  const passwordTooShort = password.length < 6;

  const emailError =
    showValidation && trimmedEmail.length === 0
      ? "Email is required."
      : showValidation && emailInvalid
        ? "Enter a valid email address."
        : undefined;

  const passwordError =
    showValidation && password.length === 0
      ? "Password is required."
      : showValidation && passwordTooShort
        ? "Password must be at least 6 characters."
        : undefined;

  const canPressLogin =
    !loading && trimmedEmail.length > 0 && password.length > 0;

  function loginErrorMessage(err: unknown): string {
    if (err instanceof Error) {
      const m = err.message;
      if (m.includes("Network request failed") || m.includes("Failed to fetch")) {
        return "No internet connection. Check your network and try again.";
      }
      return m;
    }
    return "Something went wrong. Please try again.";
  }

  async function onLogin() {
    setShowValidation(true);
    if (emailInvalid || passwordTooShort || trimmedEmail.length === 0 || password.length === 0) {
      return;
    }
    setLoading(true);
    try {
      await login({ email: trimmedEmail, password });
      router.replace("/(tabs)");
    } catch (err) {
      Alert.alert("Login failed", loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        <View style={styles.logoWrap}>
          <View style={styles.logoIcon}>
            <Ionicons name="stats-chart" size={32} color={Colors.white} />
          </View>
          <Text style={styles.title}>FinPulse</Text>
          <Text style={styles.subtitle}>Welcome back</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={[styles.input, emailError ? styles.inputError : null]}
            placeholder="basel@example.com"
            placeholderTextColor={Colors.placeholder}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            textContentType="username"
            autoComplete="email"
            editable={!loading}
          />
          {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}

          <Text style={[styles.label, { marginTop: 14 }]}>Password</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              ref={passwordRef}
              style={[styles.input, styles.passwordInput, passwordError ? styles.inputError : null]}
              placeholder="••••••••"
              placeholderTextColor={Colors.placeholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={onLogin}
              textContentType="password"
              autoComplete="password"
              editable={!loading}
            />
            <Pressable
              onPress={() => setShowPassword((v) => !v)}
              style={styles.eyeBtn}
              hitSlop={10}
            >
              <Ionicons
                name={showPassword ? "eye-off-outline" : "eye-outline"}
                size={22}
                color={Colors.textSecondary}
              />
            </Pressable>
          </View>
          {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}

          <Pressable
            onPress={() => router.push("/auth/forgot-password")}
            style={({ pressed }) => [styles.forgotWrap, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.forgot}>Forgot password?</Text>
          </Pressable>

          <View style={styles.stayRow}>
            <Text style={styles.stayLabel}>Stay logged in</Text>
            <Switch
              value={stayLoggedIn}
              onValueChange={setStayLoggedIn}
              trackColor={{ false: Colors.divider, true: Colors.successLight }}
              thumbColor={stayLoggedIn ? Colors.success : Colors.textTertiary}
            />
          </View>

          <Pressable
            onPress={onLogin}
            disabled={!canPressLogin}
            style={({ pressed }) => [
              styles.primaryBtn,
              (!canPressLogin || loading) && styles.primaryBtnDisabled,
              pressed && canPressLogin && !loading && { opacity: 0.85 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryBtnText}>Login</Text>
            )}
          </Pressable>

          {biometricAvailable && (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>
              <Pressable
                onPress={onBiometricLogin}
                style={({ pressed }) => [styles.biometricBtn, pressed && { opacity: 0.85 }]}
              >
                <Ionicons
                  name={biometricType === "Face ID" ? "scan-outline" : "finger-print-outline"}
                  size={22}
                  color={Colors.accent}
                />
                <Text style={styles.biometricText}>Login with {biometricType}</Text>
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>{"Don't have an account?"}</Text>
          <Pressable onPress={() => router.push("/auth/register")} hitSlop={10}>
            <Text style={styles.footerLink}> Create new account</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, paddingHorizontal: 22 },

  logoWrap: { alignItems: "center", marginTop: 24, marginBottom: 24 },
  logoIcon: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 36,
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 16,
    color: Colors.textSecondary,
    fontFamily: Fonts.medium,
  },

  form: { marginTop: 10 },
  label: {
    fontSize: 14,
    color: Colors.textPrimary,
    marginBottom: 8,
    fontFamily: Fonts.semiBold,
  },
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    fontSize: 15,
    color: Colors.textPrimary,
    backgroundColor: Colors.card,
    fontFamily: Fonts.regular,
  },
  inputError: {
    borderColor: Colors.danger,
  },
  fieldError: {
    marginTop: 6,
    fontSize: 13,
    color: Colors.danger,
    fontFamily: Fonts.medium,
  },

  passwordWrap: { position: "relative" as const },
  passwordInput: { paddingRight: 48 },
  eyeBtn: {
    position: "absolute" as const,
    right: 14,
    top: 0,
    height: 52,
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },

  forgotWrap: { alignSelf: "flex-end" as const, marginTop: 10 },
  forgot: {
    color: Colors.accent,
    fontSize: 14,
    fontFamily: Fonts.semiBold,
  },
  stayRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  stayLabel: { color: Colors.textSecondary, fontSize: 14, fontFamily: Fonts.medium },

  primaryBtn: {
    marginTop: 20,
    height: 54,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  primaryBtnDisabled: { opacity: 0.45 },
  primaryBtnText: {
    color: Colors.white,
    fontSize: 16,
    fontFamily: Fonts.bold,
  },

  dividerRow: { flexDirection: "row", alignItems: "center", marginTop: 20, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: Colors.border },
  dividerText: { fontSize: 13, color: Colors.textTertiary, fontFamily: Fonts.medium },
  biometricBtn: {
    marginTop: 16, height: 54, borderRadius: 16, borderWidth: 1.5, borderColor: Colors.border,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    backgroundColor: Colors.card,
  },
  biometricText: { fontSize: 15, color: Colors.accent, fontFamily: Fonts.bold },

  footer: {
    marginTop: "auto",
    paddingVertical: 18,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  footerText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontFamily: Fonts.medium,
  },
  footerLink: {
    color: Colors.accent,
    fontSize: 14,
    fontFamily: Fonts.bold,
  },
});
