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

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const canSubmit = useMemo(() => {
    const e = email.trim();
    const ok = e.includes("@") && e.includes(".");
    return ok && !loading;
  }, [email, loading]);

  function onSend() {
    if (!canSubmit) return;

    setLoading(true);
    try {
      // ✅ Mock reset for now
      Alert.alert("Email sent ✅", "We sent you a reset link (mock).");
      router.back();
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

        <Text style={styles.title}>Forgot password</Text>
        <Text style={styles.subtitle}>Enter your email to receive a reset link</Text>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="basel@example.com"
            placeholderTextColor="#A7B0C0"
            returnKeyType="done"
            onSubmitEditing={onSend}
          />

          <Pressable
            onPress={onSend}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.btn,
              !canSubmit && { opacity: 0.5 },
              pressed && canSubmit && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.btnText}>{loading ? "Sending..." : "Send reset link"}</Text>
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

  // ✅ compact + Inter font
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
    marginTop: 10,
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
});