import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors, Fonts } from "@/theme";
import { useTheme } from "@/stores/theme.store";

const SECTIONS = [
  { title: "1. Information We Collect", body: "We collect information you provide directly, such as your name, email address, and preferences. We also collect usage data including watchlist activity, alert configurations, and app interaction patterns to improve our service." },
  { title: "2. How We Use Your Data", body: "Your data is used to provide and personalize the FinPulse experience, including stock tracking, sentiment analysis, alert delivery, and recommendations. We never sell your personal data to third parties." },
  { title: "3. Data Security", body: "We implement industry-standard security measures including encryption in transit and at rest, secure authentication, and regular security audits to protect your information." },
  { title: "4. Third-Party Services", body: "FinPulse integrates with third-party APIs for stock market data, news aggregation, and sentiment analysis. These services have their own privacy policies governing data handling." },
  { title: "5. Push Notifications", body: "When you enable push notifications, we use device tokens to deliver price alerts and market updates. You can disable notifications at any time through your device settings or the app preferences." },
  { title: "6. Data Retention", body: "We retain your data for as long as your account is active. You may request deletion of your account and associated data at any time through the Profile settings." },
  { title: "7. Your Rights", body: "You have the right to access, correct, or delete your personal data. You may also request a copy of your data or restrict its processing by contacting our support team." },
];

export default function PrivacyScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(createStyles, [isDark]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={28} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.updated}>Last updated: March 2026</Text>
        <Text style={styles.intro}>
          FinPulse ("we", "our", "us") is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your information when you use our mobile application.
        </Text>

        {SECTIONS.map((s, idx) => (
          <View key={idx} style={styles.section}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Text style={styles.sectionBody}>{s.body}</Text>
          </View>
        ))}

        <View style={styles.contactCard}>
          <Ionicons name="shield-checkmark" size={24} color={Colors.success} />
          <Text style={styles.contactText}>Questions about privacy? Contact us at privacy@finpulse.io</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  headerTitle: { fontSize: 18, color: Colors.textPrimary, fontFamily: Fonts.bold },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  updated: { fontSize: 12, color: Colors.textTertiary, fontFamily: Fonts.medium, marginBottom: 16 },
  intro: { fontSize: 15, color: Colors.textSecondary, fontFamily: Fonts.regular, lineHeight: 23, marginBottom: 24 },
  section: { marginBottom: 20 },
  sectionTitle: { fontSize: 16, color: Colors.textPrimary, fontFamily: Fonts.bold, marginBottom: 8 },
  sectionBody: { fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.regular, lineHeight: 22 },
  contactCard: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.card,
    borderRadius: 16, padding: 18, marginTop: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  contactText: { flex: 1, fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.medium, lineHeight: 20 },
});
