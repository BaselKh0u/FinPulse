import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { resetPassword } from "@/services/auth.service";
import { Colors, Fonts } from "@/theme";
import { useTheme } from "@/stores/theme.store";

const MIN_PASSWORD_LEN = 8;
const PASSWORD_RULE_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;

function resetErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (m.includes("Network request failed") || m.includes("Failed to fetch")) {
      return "No internet connection. Check your network and try again.";
    }
    return m;
  }
  return "Something went wrong. Please try again.";
}

export default function ResetPasswordScreen() {
  const { isDark } = useTheme();
  const styles = useMemo(createStyles, [isDark]);
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token?: string }>();

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const password2Ref = useRef<TextInput>(null);

  useEffect(() => {
    setShowValidation(false);
  }, [password, password2]);

  const passwordError =
    showValidation && password.length === 0
      ? "Password is required."
      : showValidation && password.length < MIN_PASSWORD_LEN
        ? `Use at least ${MIN_PASSWORD_LEN} characters.`
        : showValidation && !PASSWORD_RULE_REGEX.test(password)
          ? "Password must include at least one letter and one number."
          : undefined;

  const password2Error =
    showValidation && password2.length === 0
      ? "Confirm your password."
      : showValidation && password !== password2
        ? "Passwords don’t match."
        : undefined;

  const canPressReset = !loading && password.length > 0 && password2.length > 0 && !!token;

  async function onReset() {
    setShowValidation(true);
    if (
      !token ||
      password.length < MIN_PASSWORD_LEN ||
      !PASSWORD_RULE_REGEX.test(password) ||
      password !== password2
    ) {
      return;
    }

    setLoading(true);
    try {
      await resetPassword(token, password);
      Alert.alert("Password reset", "Your password has been reset. Please log in.", [
        { text: "OK", onPress: () => router.replace("/auth/login") },
      ]);
    } catch (err) {
      Alert.alert("Couldn't reset password", resetErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        <Pressable onPress={() => router.replace("/auth/login")} style={styles.back} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
        </Pressable>

        <Text style={styles.title}>Reset password</Text>
        <Text style={styles.subtitle}>Choose a new password for your account</Text>

        <View style={styles.form}>
          {!token ? (
            <Text style={styles.fieldError}>
              This reset link is missing its token. Please request a new one from the login screen.
            </Text>
          ) : null}

          <Text style={styles.label}>New password</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              style={[styles.input, styles.passwordInput, passwordError ? styles.inputError : null]}
              placeholder={`At least ${MIN_PASSWORD_LEN} characters`}
              placeholderTextColor={Colors.placeholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => password2Ref.current?.focus()}
              textContentType="newPassword"
              autoComplete="password-new"
              editable={!loading}
            />
            <Pressable
              onPress={() => setShowPass((v) => !v)}
              style={styles.eyeBtn}
              hitSlop={10}
              disabled={loading}
            >
              <Ionicons
                name={showPass ? "eye-off-outline" : "eye-outline"}
                size={22}
                color={Colors.textSecondary}
              />
            </Pressable>
          </View>
          {passwordError ? <Text style={styles.fieldError}>{passwordError}</Text> : null}

          <Text style={[styles.label, styles.fieldGap]}>Repeat password</Text>
          <TextInput
            ref={password2Ref}
            style={[styles.input, password2Error ? styles.inputError : null]}
            placeholder="Repeat password"
            placeholderTextColor={Colors.placeholder}
            value={password2}
            onChangeText={setPassword2}
            secureTextEntry={!showPass}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={onReset}
            textContentType="newPassword"
            autoComplete="password-new"
            editable={!loading}
          />
          {password2Error ? <Text style={styles.fieldError}>{password2Error}</Text> : null}

          <Text style={styles.hint}>
            Password must be at least {MIN_PASSWORD_LEN} characters and include at least one letter and one number.
          </Text>

          <Pressable
            onPress={onReset}
            disabled={!canPressReset}
            style={({ pressed }) => [
              styles.primaryBtn,
              (!canPressReset || loading) && styles.primaryBtnDisabled,
              pressed && canPressReset && !loading && { opacity: 0.85 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryBtnText}>Reset password</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Remember your password?</Text>
          <Pressable onPress={() => router.replace("/auth/login")} hitSlop={10}>
            <Text style={styles.footerLink}> Back to Login</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, paddingHorizontal: 22, paddingTop: 8 },
  back: { width: 42, height: 42, justifyContent: "center" },

  title: {
    fontSize: 30,
    color: Colors.textPrimary,
    marginTop: 6,
    fontFamily: Fonts.bold,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 15,
    color: Colors.textSecondary,
    fontFamily: Fonts.medium,
  },

  form: { marginTop: 18 },
  label: {
    fontSize: 14,
    color: Colors.textPrimary,
    marginBottom: 8,
    fontFamily: Fonts.semiBold,
  },
  fieldGap: { marginTop: 14 },
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
  inputError: { borderColor: Colors.danger },
  fieldError: {
    marginTop: 6,
    fontSize: 13,
    color: Colors.danger,
    fontFamily: Fonts.medium,
  },
  hint: {
    marginTop: 12,
    fontSize: 12,
    color: Colors.textTertiary,
    fontFamily: Fonts.medium,
    lineHeight: 17,
  },

  passwordWrap: { position: "relative" },
  passwordInput: { paddingRight: 48 },
  eyeBtn: {
    position: "absolute",
    right: 14,
    top: 0,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },

  primaryBtn: {
    marginTop: 22,
    height: 54,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
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
