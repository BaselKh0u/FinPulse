import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { User, UserPreferences } from "@/models/User";
import {
  getUserProfile,
  getPreferences,
  updatePreferences,
  updateProfile,
  logout,
} from "@/services/user.service";
import { Colors, Fonts } from "@/theme";
import { setAvatarUri as setGlobalAvatar } from "@/stores/avatar.store";
import { useTheme } from "@/stores/theme.store";
import { setCurrency as setGlobalCurrency } from "@/stores/currency.store";
import { setBiometricEnabled } from "@/stores/biometric.store";
import * as LocalAuthentication from "expo-local-authentication";
import { setAlertSoundEnabled, setPushEnabled } from "@/services/notification.service";
import { setRefreshInterval as setGlobalRefresh } from "@/stores/refresh.store";


const CURRENCIES = ["USD", "EUR", "GBP", "ILS", "JPY"];
const REFRESH_OPTIONS: { key: UserPreferences["refreshInterval"]; label: string }[] = [
  { key: "15s", label: "15 seconds" },
  { key: "30s", label: "30 seconds" },
  { key: "1m", label: "1 minute" },
  { key: "5m", label: "5 minutes" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

let styles = createStyles();

export default function ProfileScreen() {
  const router = useRouter();
  const { isDark, toggleDark } = useTheme();
  styles = useMemo(createStyles, [isDark]);

  const [user, setUser] = useState<User | null>(null);
  const [prefs, setPrefs] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  const [editModal, setEditModal] = useState(false);
  const [editFirst, setEditFirst] = useState("");
  const [editLast, setEditLast] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [currencyModal, setCurrencyModal] = useState(false);
  const [refreshModal, setRefreshModal] = useState(false);

  const editScrollRef = useRef<ScrollView>(null);

  const load = useCallback(async () => {
    const [u, p] = await Promise.all([getUserProfile(), getPreferences()]);
    setUser(u);
    setPrefs(p);
  }, []);

  useEffect(() => {
    (async () => {
      try { setLoading(true); await load(); } finally { setLoading(false); }
    })();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function pickAvatar() {
    Alert.alert("Change Profile Photo", "Choose a source", [
      {
        text: "Camera",
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== "granted") {
            Alert.alert("Permission Required", "Camera access is needed to take a profile photo.");
            return;
          }
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            setAvatarUri(result.assets[0].uri);
            setGlobalAvatar(result.assets[0].uri);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        },
      },
      {
        text: "Gallery",
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== "granted") {
            Alert.alert("Permission Required", "Photo library access is needed to select a profile photo.");
            return;
          }
          const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
          });
          if (!result.canceled && result.assets[0]) {
            setAvatarUri(result.assets[0].uri);
            setGlobalAvatar(result.assets[0].uri);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        },
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function togglePref(key: keyof UserPreferences, value: boolean) {
    if (!prefs) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const updated = await updatePreferences({ [key]: value });
    setPrefs(updated);
  }

  function openEditProfile() {
    if (!user) return;
    setEditFirst(user.firstName);
    setEditLast(user.lastName);
    setEditPhone(user.phone ?? "");
    setEditModal(true);
  }

  async function saveProfile() {
    setEditSaving(true);
    try {
      const updated = await updateProfile({
        firstName: editFirst.trim(),
        lastName: editLast.trim(),
        phone: editPhone.trim() || undefined,
      });
      setUser(updated);
      setEditModal(false);
    } catch {
      Alert.alert("Error", "Failed to update profile.");
    } finally {
      setEditSaving(false);
    }
  }

  async function selectCurrency(c: string) {
    setCurrencyModal(false);
    const updated = await updatePreferences({ currency: c });
    setPrefs(updated);
    await setGlobalCurrency(c);
  }

  async function selectRefresh(r: UserPreferences["refreshInterval"]) {
    setRefreshModal(false);
    setGlobalRefresh(r);
    const updated = await updatePreferences({ refreshInterval: r });
    setPrefs(updated);
  }

  async function handleBiometricToggle(enable: boolean) {
    if (enable) {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!compatible || !enrolled) {
        Alert.alert("Not Available", "Your device doesn't support biometric authentication or has none enrolled.");
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Verify your identity to enable biometric login",
        disableDeviceFallback: false,
      });
      if (!result.success) return;
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await setBiometricEnabled(enable);
    const updated = await updatePreferences({ biometricLogin: enable });
    setPrefs(updated);
  }

  function onLogout() {
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: async () => {
        await logout();
        router.replace("/auth/login");
      }},
    ]);
  }

  function onDeleteAccount() {
    Alert.alert(
      "Delete Account",
      "This action is irreversible. All your data, watchlists, and alerts will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => {
          Alert.alert("Account Deleted", "Your account has been deleted.");
        }},
      ]
    );
  }

  if (loading || !user || !prefs) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const initials = `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>

        {/* User Card */}
        <View style={styles.userCard}>
          <Pressable onPress={pickAvatar} style={styles.avatarWrap}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
            )}
            <View style={styles.cameraIcon}>
              <Ionicons name="camera" size={14} color={Colors.white} />
            </View>
          </Pressable>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user.firstName} {user.lastName}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
            <View style={styles.metaRow}>
              {user.isVerified && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="shield-checkmark" size={13} color={Colors.success} />
                  <Text style={styles.verifiedText}>Verified</Text>
                </View>
              )}
              <Text style={styles.joinDate}>Member since {formatDate(user.joinedAt)}</Text>
            </View>
          </View>
        </View>

        {/* Account Section */}
        <Text style={styles.sectionLabel}>ACCOUNT</Text>
        <View style={styles.section}>
          <SettingsRow icon="person-outline" label="Edit Profile" onPress={openEditProfile} />
          <Divider />
          <SettingsRow icon="lock-closed-outline" label="Change Password" onPress={() =>
            Alert.alert("Change Password", "This will send a password reset link to your email.", [
              { text: "Cancel", style: "cancel" },
              { text: "Send Link", onPress: () => Alert.alert("Sent", "Check your email for the reset link.") },
            ])
          } />
          <Divider />
          <SettingsRow
            icon="shield-checkmark-outline"
            label="Verification Status"
            onPress={() => {
              if (user.isVerified) {
                Alert.alert("Verified", "Your account has been verified by FinPulse.");
              } else {
                Alert.alert("Verification Pending", "Complete your profile and verify your email to get the verified badge. This is handled by the backend once your identity is confirmed.");
              }
            }}
            trailing={
              <View style={[styles.statusChip, user.isVerified ? styles.statusVerified : styles.statusPending]}>
                <Text style={[styles.statusText, { color: user.isVerified ? Colors.success : Colors.warning }]}>
                  {user.isVerified ? "Verified" : "Pending"}
                </Text>
              </View>
            }
          />
        </View>

        {/* Preferences Section */}
        <Text style={styles.sectionLabel}>PREFERENCES</Text>
        <View style={styles.section}>
          <SettingsToggle icon="notifications-outline" label="Push Notifications" value={prefs.pushNotifications}
            onToggle={async (v) => { setPushEnabled(v); await togglePref("pushNotifications", v); }} />
          <Divider />
          <SettingsToggle icon="volume-high-outline" label="Alert Sound" value={prefs.alertSound}
            onToggle={async (v) => { setAlertSoundEnabled(v); await togglePref("alertSound", v); }} />
          <Divider />
          <SettingsToggle icon="finger-print-outline" label="Biometric Login" value={prefs.biometricLogin}
            onToggle={handleBiometricToggle} />
          <Divider />
          <SettingsToggle icon="moon-outline" label="Dark Mode" value={isDark}
            onToggle={() => { toggleDark(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} />
        </View>

        {/* Data Section */}
        <Text style={styles.sectionLabel}>DATA</Text>
        <View style={styles.section}>
          <SettingsRow icon="cash-outline" label="Default Currency"
            trailing={<Text style={styles.trailingValue}>{prefs.currency}</Text>}
            onPress={() => setCurrencyModal(true)} />
          <Divider />
          <SettingsRow icon="refresh-outline" label="Data Refresh"
            trailing={<Text style={styles.trailingValue}>
              {REFRESH_OPTIONS.find((r) => r.key === prefs.refreshInterval)?.label}
            </Text>}
            onPress={() => setRefreshModal(true)} />
        </View>

        {/* Support Section */}
        <Text style={styles.sectionLabel}>SUPPORT</Text>
        <View style={styles.section}>
          <SettingsRow icon="help-circle-outline" label="Help Center" onPress={() =>
            router.push("/info/help")} />
          <Divider />
          <SettingsRow icon="chatbubble-ellipses-outline" label="Contact Support" onPress={() => {
            Linking.openURL("mailto:support@finpulse.io?subject=FinPulse%20Support%20Request").catch(() =>
              Alert.alert("Contact Support", "Email us at support@finpulse.io and we'll get back to you within 24 hours."));
          }} />
          <Divider />
          <SettingsRow icon="star-outline" label="Rate FinPulse" onPress={() => {
            const storeUrl = Platform.OS === "ios"
              ? "https://apps.apple.com/app/finpulse/id0000000000"
              : "https://play.google.com/store/apps/details?id=com.finpulse.app";
            Linking.openURL(storeUrl).catch(() =>
              Alert.alert("Thanks!", "We appreciate your support. The store link will be available once the app is published."));
          }} />
          <Divider />
          <SettingsRow icon="document-text-outline" label="Privacy Policy" onPress={() =>
            router.push("/info/privacy")} />
          <Divider />
          <SettingsRow icon="reader-outline" label="Terms of Service" onPress={() =>
            router.push("/info/terms")} />
        </View>

        {/* Danger Zone */}
        <Text style={styles.sectionLabel}>DANGER ZONE</Text>
        <View style={styles.section}>
          <SettingsRow icon="log-out-outline" label="Log Out" danger onPress={onLogout} />
          <Divider />
          <SettingsRow icon="trash-outline" label="Delete Account" danger onPress={onDeleteAccount} />
        </View>

        <Text style={styles.versionText}>FinPulse v1.0.0</Text>

      </ScrollView>

      {/* Edit Profile Modal */}
      <Modal visible={editModal} transparent animationType="slide" onRequestClose={() => setEditModal(false)}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 10 : 0}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }}
            onPress={() => { Keyboard.dismiss(); setEditModal(false); }}
          />
          <View style={styles.editSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <ScrollView
              ref={editScrollRef}
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              <Text style={styles.fieldLabel}>First Name</Text>
              <TextInput style={styles.fieldInput} value={editFirst} onChangeText={setEditFirst}
                placeholder="First name" placeholderTextColor={Colors.placeholder}
                onFocus={() => setTimeout(() => editScrollRef.current?.scrollToEnd({ animated: true }), 150)} />

              <Text style={styles.fieldLabel}>Last Name</Text>
              <TextInput style={styles.fieldInput} value={editLast} onChangeText={setEditLast}
                placeholder="Last name" placeholderTextColor={Colors.placeholder}
                onFocus={() => setTimeout(() => editScrollRef.current?.scrollToEnd({ animated: true }), 150)} />

              <Text style={styles.fieldLabel}>Phone (optional)</Text>
              <TextInput style={styles.fieldInput} value={editPhone} onChangeText={setEditPhone}
                placeholder="+972 54-XXX-XXXX" placeholderTextColor={Colors.placeholder}
                keyboardType="phone-pad"
                onFocus={() => setTimeout(() => editScrollRef.current?.scrollToEnd({ animated: true }), 150)} />

              <View style={styles.modalBtns}>
                <Pressable style={styles.cancelBtn} onPress={() => { Keyboard.dismiss(); setEditModal(false); }}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
                <Pressable style={styles.saveBtn} onPress={saveProfile} disabled={editSaving}>
                  <Text style={styles.saveBtnText}>{editSaving ? "Saving..." : "Save"}</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Currency Picker */}
      <Modal visible={currencyModal} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setCurrencyModal(false)} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Default Currency</Text>
          {CURRENCIES.map((c) => (
            <Pressable key={c} style={styles.pickerRow} onPress={() => selectCurrency(c)}>
              <Text style={[styles.pickerText, prefs.currency === c && styles.pickerActive]}>{c}</Text>
              {prefs.currency === c && <Ionicons name="checkmark" size={20} color={Colors.accent} />}
            </Pressable>
          ))}
        </View>
      </Modal>

      {/* Refresh Interval Picker */}
      <Modal visible={refreshModal} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setRefreshModal(false)} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Data Refresh Interval</Text>
          {REFRESH_OPTIONS.map((r) => (
            <Pressable key={r.key} style={styles.pickerRow} onPress={() => selectRefresh(r.key)}>
              <Text style={[styles.pickerText, prefs.refreshInterval === r.key && styles.pickerActive]}>{r.label}</Text>
              {prefs.refreshInterval === r.key && <Ionicons name="checkmark" size={20} color={Colors.accent} />}
            </Pressable>
          ))}
        </View>
      </Modal>

    </SafeAreaView>
  );
}

/* ─── Reusable Row Components ─── */

function SettingsRow({ icon, label, trailing, danger, onPress }: {
  icon: string; label: string; trailing?: React.ReactNode; danger?: boolean; onPress?: () => void;
}) {
  const { isDark } = useTheme();
  const labelColor = danger ? Colors.danger : (isDark ? "#FFFFFF" : Colors.textPrimary);
  return (
    <Pressable style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <View style={[styles.rowIconWrap, { backgroundColor: danger ? Colors.dangerLight : (isDark ? "#1E2D44" : "#E9EDF6") }]}>
        <Ionicons name={icon as any} size={20} color={danger ? Colors.danger : Colors.accent} />
      </View>
      <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
      <View style={styles.rowTrailing}>
        {trailing ?? <Ionicons name="chevron-forward" size={18} color={Colors.textSecondary} />}
      </View>
    </Pressable>
  );
}

function SettingsToggle({ icon, label, value, onToggle }: {
  icon: string; label: string; value: boolean; onToggle: (v: boolean) => void;
}) {
  const { isDark } = useTheme();
  const labelColor = isDark ? "#FFFFFF" : Colors.textPrimary;
  return (
    <View style={styles.row}>
      <View style={[styles.rowIconWrap, { backgroundColor: isDark ? "#1E2D44" : "#E9EDF6" }]}>
        <Ionicons name={icon as any} size={20} color={Colors.accent} />
      </View>
      <Text style={[styles.rowLabel, { color: labelColor }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onToggle}
        trackColor={{ false: Colors.divider, true: Colors.successLight }}
        thumbColor={value ? Colors.success : Colors.textTertiary}
      />
    </View>
  );
}

function Divider() {
  const { isDark } = useTheme();
  return (
    <View
      style={[
        styles.divider,
        isDark && { backgroundColor: "rgba(255,255,255,0.04)" },
      ]}
    />
  );
}

/* ─── Styles ─── */

function createStyles() { return StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingBottom: 40 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 },
  headerTitle: { fontSize: 30, color: Colors.textPrimary, fontFamily: Fonts.bold },

  userCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.card,
    marginHorizontal: 20, borderRadius: 20, padding: 20, marginTop: 8, marginBottom: 24,
    shadowColor: Colors.shadow, shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 2,
  },
  avatar: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.logoBox,
    alignItems: "center", justifyContent: "center",
  },
  avatarWrap: { position: "relative", marginRight: 16 },
  avatarImage: { width: 64, height: 64, borderRadius: 32 },
  cameraIcon: {
    position: "absolute", bottom: -2, right: -2, width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: Colors.card,
  },
  avatarText: { fontSize: 24, color: Colors.white, fontFamily: Fonts.bold },
  userInfo: { flex: 1 },
  userName: { fontSize: 20, color: Colors.textPrimary, fontFamily: Fonts.bold },
  userEmail: { fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.medium, marginTop: 2 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 },
  verifiedBadge: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.successLight,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  verifiedText: { fontSize: 11, color: Colors.success, fontFamily: Fonts.bold },
  joinDate: { fontSize: 12, color: Colors.textTertiary, fontFamily: Fonts.medium },

  sectionLabel: {
    fontSize: 12, color: Colors.textTertiary, fontFamily: Fonts.semiBold, letterSpacing: 1,
    paddingHorizontal: 20, marginBottom: 8, marginTop: 4,
  },
  section: {
    backgroundColor: Colors.card, marginHorizontal: 20, borderRadius: 18, marginBottom: 20,
    shadowColor: Colors.shadow, shadowOpacity: 0.02, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },

  row: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 15,
  },
  rowIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center", marginRight: 14,
  },
  rowLabel: { flex: 1, fontSize: 15, color: Colors.textPrimary, fontFamily: Fonts.medium },
  rowTrailing: { marginLeft: 8 },

  trailingValue: { fontSize: 14, color: Colors.accent, fontFamily: Fonts.semiBold },

  divider: { height: 1, backgroundColor: Colors.divider, marginLeft: 66 },

  statusChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusVerified: { backgroundColor: Colors.successLight },
  statusPending: { backgroundColor: Colors.warningLight },
  statusText: { fontSize: 12, fontFamily: Fonts.bold },

  versionText: {
    textAlign: "center", color: Colors.textTertiary, fontSize: 13,
    fontFamily: Fonts.medium, marginTop: 8, paddingBottom: 10,
  },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  modalSheet: {
    backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40,
    position: "absolute", bottom: 0, left: 0, right: 0,
  },
  editSheet: {
    backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40,
    maxHeight: "80%",
  },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.divider, alignSelf: "center", marginBottom: 18 },
  modalTitle: { fontSize: 22, color: Colors.textPrimary, fontFamily: Fonts.bold, marginBottom: 20 },

  fieldLabel: { fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.semiBold, marginBottom: 6, marginTop: 12 },
  fieldInput: {
    height: 50, borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 16, fontSize: 15, color: Colors.textPrimary, backgroundColor: Colors.background,
    fontFamily: Fonts.regular,
  },

  modalBtns: { flexDirection: "row", gap: 12, marginTop: 24 },
  cancelBtn: {
    height: 50, paddingHorizontal: 24, borderRadius: 14, backgroundColor: Colors.iconBackground,
    alignItems: "center", justifyContent: "center",
  },
  cancelBtnText: { fontSize: 15, color: Colors.textSecondary, fontFamily: Fonts.semiBold },
  saveBtn: {
    flex: 1, height: 50, borderRadius: 14, backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  saveBtnText: { color: Colors.white, fontSize: 15, fontFamily: Fonts.bold },

  pickerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
  pickerText: { fontSize: 16, color: Colors.textPrimary, fontFamily: Fonts.medium },
  pickerActive: { color: Colors.accent, fontFamily: Fonts.bold },
}); }
