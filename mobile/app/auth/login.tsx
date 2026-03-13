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
import { login } from "@/services/auth.service";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const canSubmit = useMemo(() => {
    return EMAIL_REGEX.test(email.trim()) && password.trim().length >= 6 && !loading;
  }, [email, password, loading]);

  async function onLogin() {
    if (!canSubmit) return;

    setLoading(true);
    try {
      await login({ email: email.trim(), password });
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
        {/* Logo */}
        <View style={styles.logoWrap}>
          <View style={styles.logoIcon}>
            <Ionicons name="bar-chart" size={38} color="#0B1220" />
          </View>

          <Text style={styles.title}>FinPulse</Text>
          <Text style={styles.subtitle}>Welcome back</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="basel@example.com"
            placeholderTextColor="#A7B0C0"
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
              placeholderTextColor="#A7B0C0"
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
                color="#6B758A"
              />
            </Pressable>
          </View>

          <Pressable
            onPress={() => router.push("/auth/forgot-password")}
            style={({ pressed }) => [
              styles.forgotWrap,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.forgot}>Forgot password?</Text>
          </Pressable>

          <Pressable
            onPress={onLogin}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.loginBtn,
              (!canSubmit || loading) && { opacity: 0.5 },
              pressed && canSubmit && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.loginText}>
              {loading ? "Logging in..." : "Login"}
            </Text>
          </Pressable>
        </View>

        {/* Footer */}
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
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  container: { flex: 1, paddingHorizontal: 22 },

  logoWrap: { alignItems: "center", marginTop: 18, marginBottom: 18 },
  logoIcon: {
    width: 66,
    height: 66,
    borderRadius: 16,
    backgroundColor: "#F2F4F8",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 36,
    color: "#0B1220",
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 16,
    color: "#6B758A",
    fontFamily: "Inter_500Medium",
  },

  form: { marginTop: 10 },
  label: {
    fontSize: 14,
    color: "#0B1220",
    marginBottom: 8,
    fontFamily: "Inter_600SemiBold",
  },
  input: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E3E7EF",
    paddingHorizontal: 14,
    fontSize: 15,
    color: "#0B1220",
    backgroundColor: "#FFFFFF",
    fontFamily: "Inter_400Regular",
  },

  passwordWrap: { position: "relative" },
  passwordInput: { paddingRight: 48 },
  eyeBtn: {
    position: "absolute",
    right: 12,
    top: 0,
    height: 50,
    alignItems: "center",
    justifyContent: "center",
  },

  forgotWrap: { alignSelf: "flex-end", marginTop: 10 },
  forgot: {
    color: "#2C66FF",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },

  loginBtn: {
    marginTop: 16,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#0B1220",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  loginText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },

  footer: {
    marginTop: "auto",
    paddingVertical: 16,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
  },
  footerText: {
    color: "#6B758A",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  footerLink: {
    color: "#2C66FF",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
});