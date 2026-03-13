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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const router = useRouter();

  const [firstName, setFirstName] = useState<string>("");
  const [lastName, setLastName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [password2, setPassword2] = useState<string>("");
  const [showPass, setShowPass] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const canSubmit = useMemo(() => {
    const emailOk = EMAIL_REGEX.test(email.trim());
    return (
      firstName.trim().length >= 2 &&
      lastName.trim().length >= 2 &&
      emailOk &&
      password.trim().length >= 6 &&
      password === password2 &&
      !loading
    );
  }, [firstName, lastName, email, password, password2, loading]);

  async function onRegister() {
    if (!canSubmit) return;

    setLoading(true);
    try {
      // TODO: call register API when backend is ready
      Alert.alert("Account created ✅", "Now you can login.");
      router.replace("/auth/login");
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
          <Ionicons name="chevron-back" size={26} color="#0B1220" />
        </Pressable>

        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Let’s get you started</Text>

        <View style={styles.form}>
          <Text style={styles.label}>First name</Text>
          <TextInput
            style={styles.input}
            placeholder="Basel"
            placeholderTextColor="#A7B0C0"
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={[styles.label, { marginTop: 12 }]}>Last name</Text>
          <TextInput
            style={styles.input}
            placeholder="Khoury"
            placeholderTextColor="#A7B0C0"
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
          />

          <Text style={[styles.label, { marginTop: 12 }]}>Email</Text>
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

          <Text style={[styles.label, { marginTop: 12 }]}>Password</Text>
          <View style={styles.passwordWrap}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="At least 6 characters"
              placeholderTextColor="#A7B0C0"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPass}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
            <Pressable onPress={() => setShowPass((v) => !v)} style={styles.eyeBtn} hitSlop={10}>
              <Ionicons
                name={showPass ? "eye-off-outline" : "eye-outline"}
                size={22}
                color="#6B758A"
              />
            </Pressable>
          </View>

          <Text style={[styles.label, { marginTop: 12 }]}>Repeat password</Text>
          <TextInput
            style={styles.input}
            placeholder="Repeat password"
            placeholderTextColor="#A7B0C0"
            value={password2}
            onChangeText={setPassword2}
            secureTextEntry={!showPass}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={onRegister}
          />

          <Pressable
            onPress={onRegister}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.btn,
              (!canSubmit || loading) && { opacity: 0.5 },
              pressed && canSubmit && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.btnText}>{loading ? "Creating..." : "Create account"}</Text>
          </Pressable>

          <Pressable onPress={() => router.replace("/auth/login")} style={styles.bottomLink}>
            <Text style={styles.bottomText}>
              Already have an account? <Text style={styles.link}>Login</Text>
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  container: { flex: 1, paddingHorizontal: 22, paddingTop: 8 },
  back: { width: 42, height: 42, justifyContent: "center" },

  title: {
    fontSize: 30,
    color: "#0B1220",
    marginTop: 6,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B758A",
    fontFamily: "Inter_500Medium",
  },

  form: { marginTop: 14 },
  label: {
    fontSize: 13,
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

  btn: {
    marginTop: 16,
    height: 54,
    borderRadius: 18,
    backgroundColor: "#0B1220",
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },

  bottomLink: { marginTop: 12, alignItems: "center" },
  bottomText: {
    color: "#6B758A",
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  link: { color: "#2C66FF", fontFamily: "Inter_700Bold" },
});