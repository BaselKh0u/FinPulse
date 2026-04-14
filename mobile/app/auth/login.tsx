import { useMemo, useState } from "react";
import {
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
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { login } from "@/services/auth.service";
import { Colors } from "@/theme";
import { Fonts } from "@/theme";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(true);
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(
    () => EMAIL_REGEX.test(email.trim()) && password.trim().length >= 6 && !loading,
    [email, password, loading]
  );

  async function onLogin() {
    if (!canSubmit) return;
    setLoading(true);
    try {
      await login({ email: email.trim(), password, stayLoggedIn });
      router.replace("/(tabs)");
    } catch (err) {
      Alert.alert("Login failed", err instanceof Error ? err.message : "Please try again.");
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
            style={styles.input}
            placeholder="basel@example.com"
            placeholderTextColor={Colors.placeholder}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={[styles.label, { marginTop: 14 }]}>Password</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="••••••••"
              placeholderTextColor={Colors.placeholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={onLogin}
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
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.primaryBtn,
              (!canSubmit || loading) && styles.primaryBtnDisabled,
              pressed && canSubmit && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.primaryBtnText}>
              {loading ? "Logging in..." : "Login"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account?</Text>
          <Pressable onPress={() => router.push("/auth/register")} hitSlop={10}>
            <Text style={styles.footerLink}> Create new account</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.white },
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
    backgroundColor: Colors.white,
    fontFamily: Fonts.regular,
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
