import { useMemo, useState } from "react";
import {
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(
    () => EMAIL_REGEX.test(email.trim()) && !loading,
    [email, loading]
  );

  async function onSend() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      Alert.alert("Email sent", "We sent you a reset link.");
      router.back();
    } catch (err) {
      Alert.alert("Failed", err instanceof Error ? err.message : "Please try again.");
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
        <Pressable onPress={() => router.back()} style={styles.back} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
        </Pressable>

        <Text style={styles.title}>Forgot password</Text>
        <Text style={styles.subtitle}>Enter your email to receive a reset link</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="basel@example.com"
            placeholderTextColor={Colors.placeholder}
            returnKeyType="done"
            onSubmitEditing={onSend}
          />

          <Pressable
            onPress={onSend}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.primaryBtn,
              (!canSubmit || loading) && styles.primaryBtnDisabled,
              pressed && canSubmit && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.primaryBtnText}>
              {loading ? "Sending..." : "Send reset link"}
            </Text>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },
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
    backgroundColor: Colors.white,
    fontFamily: Fonts.regular,
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
