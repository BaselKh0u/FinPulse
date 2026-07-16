import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { register } from "@/services/auth.service";
import { runPostRegistrationPermissionPrompts } from "@/services/onboarding-permissions.service";
import { Colors, Fonts } from "@/theme";
import { useTheme } from "@/stores/theme.store";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_NAME_LEN = 2;
const MAX_NAME_LEN = 60;
const MIN_PASSWORD_LEN = 8;
const PASSWORD_RULE_REGEX = /^(?=.*[A-Za-z])(?=.*\d).+$/;

function registerErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const m = err.message;
    if (m.includes("Network request failed") || m.includes("Failed to fetch")) {
      return "No internet connection. Check your network and try again.";
    }
    return m;
  }
  return "Something went wrong. Please try again.";
}

export default function RegisterScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(createStyles, [isDark]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [serverEmailError, setServerEmailError] = useState<string | null>(null);
  const [serverPasswordError, setServerPasswordError] = useState<string | null>(null);

  const lastNameRef = useRef<TextInput>(null);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const password2Ref = useRef<TextInput>(null);

  useEffect(() => {
    setShowValidation(false);
    setServerEmailError(null);
    setServerPasswordError(null);
  }, [firstName, lastName, email, password, password2]);

  const tFirst = firstName.trim();
  const tLast = lastName.trim();
  const tEmail = email.trim();

  const firstNameError =
    showValidation && tFirst.length === 0
      ? "First name is required."
      : showValidation && tFirst.length < MIN_NAME_LEN
        ? `Use at least ${MIN_NAME_LEN} characters.`
        : showValidation && tFirst.length > MAX_NAME_LEN
          ? `Max ${MAX_NAME_LEN} characters.`
          : undefined;

  const lastNameError =
    showValidation && tLast.length === 0
      ? "Last name is required."
      : showValidation && tLast.length < MIN_NAME_LEN
        ? `Use at least ${MIN_NAME_LEN} characters.`
        : showValidation && tLast.length > MAX_NAME_LEN
          ? `Max ${MAX_NAME_LEN} characters.`
          : undefined;

  const emailError =
    showValidation && tEmail.length === 0
      ? "Email is required."
      : showValidation && !EMAIL_REGEX.test(tEmail)
        ? "Enter a valid email address."
        : serverEmailError ?? undefined;

  const passwordError =
    showValidation && password.length === 0
      ? "Password is required."
      : showValidation && password.length < MIN_PASSWORD_LEN
        ? `Use at least ${MIN_PASSWORD_LEN} characters.`
        : showValidation && !PASSWORD_RULE_REGEX.test(password)
          ? "Password must include at least one letter and one number."
          : serverPasswordError ?? undefined;

  const password2Error =
    showValidation && password2.length === 0
      ? "Confirm your password."
      : showValidation && password !== password2
        ? "Passwords don’t match."
        : undefined;

  const canPressCreate =
    !loading &&
    tFirst.length > 0 &&
    tLast.length > 0 &&
    tEmail.length > 0 &&
    password.length > 0 &&
    password2.length > 0;

  async function onRegister() {
    setShowValidation(true);
    if (
      tFirst.length < MIN_NAME_LEN ||
      tFirst.length > MAX_NAME_LEN ||
      tLast.length < MIN_NAME_LEN ||
      tLast.length > MAX_NAME_LEN ||
      !EMAIL_REGEX.test(tEmail) ||
      password.length < MIN_PASSWORD_LEN ||
      !PASSWORD_RULE_REGEX.test(password) ||
      password !== password2
    ) {
      return;
    }

    setLoading(true);
    setServerEmailError(null);
    setServerPasswordError(null);
    try {
      await register({
        firstName: tFirst,
        lastName: tLast,
        email: tEmail,
        password,
      });
      await runPostRegistrationPermissionPrompts();
      Alert.alert(
        "Verify your email",
        `We sent a verification email to ${tEmail}. Please verify your email before continuing.`,
        [
          { text: "Back to Login", onPress: () => router.replace("/auth/login") },
        ]
      );
    } catch (err) {
      const message = registerErrorMessage(err);
      const normalized = message.toLowerCase();
      if (normalized.includes("already exists")) {
        setServerEmailError("This email is already in use.");
        return;
      }
      if (
        normalized.includes("password") &&
        (normalized.includes("required") || normalized.includes("at least") || normalized.includes("must"))
      ) {
        setServerPasswordError(message);
        return;
      }
      Alert.alert("Registration failed", message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
      >
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Pressable onPress={() => router.back()} style={styles.back} hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
          </Pressable>

          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>{"Let's get you started"}</Text>

          <View style={styles.form}>
            <Text style={styles.label}>First name</Text>
            <TextInput
              style={[styles.input, firstNameError ? styles.inputError : null]}
              placeholder="First name"
              placeholderTextColor={Colors.placeholder}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => lastNameRef.current?.focus()}
              textContentType="givenName"
              autoComplete="name-given"
              editable={!loading}
            />
            {firstNameError ? <Text style={styles.fieldError}>{firstNameError}</Text> : null}

            <Text style={[styles.label, styles.fieldGap]}>Last name</Text>
            <TextInput
              ref={lastNameRef}
              style={[styles.input, lastNameError ? styles.inputError : null]}
              placeholder="Last name"
              placeholderTextColor={Colors.placeholder}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              textContentType="familyName"
              autoComplete="name-family"
              editable={!loading}
            />
            {lastNameError ? <Text style={styles.fieldError}>{lastNameError}</Text> : null}

            <Text style={[styles.label, styles.fieldGap]}>Email</Text>
            <TextInput
              ref={emailRef}
              style={[styles.input, emailError ? styles.inputError : null]}
              placeholder="Email address"
              placeholderTextColor={Colors.placeholder}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
              textContentType="emailAddress"
              autoComplete="email"
              editable={!loading}
            />
            {emailError ? <Text style={styles.fieldError}>{emailError}</Text> : null}

            <Text style={[styles.label, styles.fieldGap]}>Password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                ref={passwordRef}
                style={[
                  styles.input,
                  styles.passwordInput,
                  passwordError ? styles.inputError : null,
                ]}
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
              onSubmitEditing={onRegister}
              textContentType="newPassword"
              autoComplete="password-new"
              editable={!loading}
            />
            {password2Error ? <Text style={styles.fieldError}>{password2Error}</Text> : null}

            <Text style={styles.hint}>
              Password must be at least {MIN_PASSWORD_LEN} characters and include at least one letter and one number.
            </Text>

            <Pressable
              onPress={onRegister}
              disabled={!canPressCreate}
              style={({ pressed }) => [
                styles.primaryBtn,
                (!canPressCreate || loading) && styles.primaryBtnDisabled,
                pressed && canPressCreate && !loading && { opacity: 0.85 },
              ]}
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.primaryBtnText}>Create account</Text>
              )}
            </Pressable>

            <Pressable
              onPress={() => router.push("/info/terms")}
              style={styles.termsWrap}
              disabled={loading}
            >
              <Text style={styles.termsText}>
                By creating an account you agree to our <Text style={styles.termsLink}>Terms</Text>
              </Text>
            </Pressable>

            <View style={styles.footer}>
              <Text style={styles.footerText}>Already have an account?</Text>
              <Pressable onPress={() => router.replace("/auth/login")} hitSlop={10} disabled={loading}>
                <Text style={styles.footerLink}> Login</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const createStyles = () =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.background },
    flex: { flex: 1 },
    container: { flex: 1, paddingHorizontal: 22 },
    scrollContent: { paddingTop: 8, paddingBottom: 30 },
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

    termsWrap: { marginTop: 14, paddingHorizontal: 4 },
    termsText: {
      fontSize: 12,
      color: Colors.textTertiary,
      fontFamily: Fonts.medium,
      textAlign: "center",
      lineHeight: 18,
    },
    termsLink: { color: Colors.accent, fontFamily: Fonts.semiBold },

    footer: {
      marginTop: 16,
      paddingBottom: 8,
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
