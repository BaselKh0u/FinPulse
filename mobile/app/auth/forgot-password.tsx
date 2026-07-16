import { useEffect, useMemo, useState } from "react";
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
import { useRouter } from "expo-router";
import { forgotPassword } from "@/services/auth.service";
import { Colors, Fonts } from "@/theme";
import { useTheme } from "@/stores/theme.store";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const { isDark } = useTheme();
  const styles = useMemo(createStyles, [isDark]);
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  useEffect(() => {
    setShowValidation(false);
  }, [email]);

  const trimmedEmail = email.trim();
  const emailInvalid = !EMAIL_REGEX.test(trimmedEmail);

  const emailError =
    showValidation && trimmedEmail.length === 0
      ? "Email is required."
      : showValidation && emailInvalid
        ? "Enter a valid email address."
        : undefined;

  const canPressSend = !loading && trimmedEmail.length > 0;

  function sendErrorMessage(err: unknown): string {
    if (err instanceof Error) {
      const m = err.message;
      if (m.includes("Network request failed") || m.includes("Failed to fetch")) {
        return "No internet connection. Check your network and try again.";
      }
      return m;
    }
    return "Something went wrong. Please try again.";
  }

  async function onSend() {
    setShowValidation(true);
    if (trimmedEmail.length === 0 || emailInvalid) return;

    setLoading(true);
    try {
      await forgotPassword(trimmedEmail);
      Alert.alert(
        "Check your email",
        "If an account exists for this address, you'll receive reset instructions shortly.",
        [{ text: "OK", onPress: () => router.back() }]
      );
    } catch (err) {
      Alert.alert("Couldn't send reset link", sendErrorMessage(err));
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
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
        </Pressable>

        <Text style={styles.title}>Forgot password</Text>
        <Text style={styles.subtitle}>Enter your email to receive a reset link</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={[styles.input, emailError ? styles.inputError : null]}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="Email address"
            placeholderTextColor={Colors.placeholder}
            returnKeyType="done"
            onSubmitEditing={onSend}
            textContentType="emailAddress"
            autoComplete="email"
            editable={!loading}
          />
          {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}

          <Pressable
            onPress={onSend}
            disabled={!canPressSend}
            style={({ pressed }) => [
              styles.primaryBtn,
              (!canPressSend || loading) && styles.primaryBtnDisabled,
              pressed && canPressSend && !loading && { opacity: 0.85 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryBtnText}>Send reset link</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Remember your password?</Text>
          <Pressable onPress={() => router.back()} hitSlop={10}>
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
