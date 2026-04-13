import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors, Fonts } from "@/theme";
import { useTheme } from "@/stores/theme.store";

const SECTIONS = [
  { title: "1. Acceptance of Terms", body: "By downloading, installing, or using FinPulse, you agree to be bound by these Terms of Service. If you do not agree, please do not use the application." },
  { title: "2. Service Description", body: "FinPulse provides stock market tracking, sentiment analysis, and alert notification services. The app aggregates data from various sources to deliver market insights and allows users to manage watchlists and configure alerts." },
  { title: "3. Not Financial Advice", body: "FinPulse is an informational tool only. Nothing in this app constitutes financial, investment, legal, or tax advice. Always consult with a qualified financial advisor before making investment decisions. Past performance is not indicative of future results." },
  { title: "4. User Accounts", body: "You are responsible for maintaining the confidentiality of your account credentials. You agree to notify us immediately of any unauthorized use of your account." },
  { title: "5. Acceptable Use", body: "You agree not to misuse the service, attempt to gain unauthorized access, reverse-engineer the application, or use automated tools to scrape data from the platform." },
  { title: "6. Data Accuracy", body: "While we strive to provide accurate and timely data, we do not guarantee the accuracy, completeness, or reliability of any information displayed in the app. Market data may be delayed." },
  { title: "7. Limitation of Liability", body: "FinPulse shall not be liable for any direct, indirect, incidental, or consequential damages arising from the use or inability to use the service, including any losses from investment decisions." },
  { title: "8. Modifications", body: "We reserve the right to modify these terms at any time. Continued use of the app after changes constitutes acceptance of the modified terms." },
];

export default function TermsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(createStyles, [isDark]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={28} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Terms of Service</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.updated}>Last updated: March 2026</Text>
        <Text style={styles.intro}>
          Please read these Terms of Service carefully before using the FinPulse mobile application.
        </Text>

        {SECTIONS.map((s, idx) => (
          <View key={idx} style={styles.section}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Text style={styles.sectionBody}>{s.body}</Text>
          </View>
        ))}

        <View style={styles.noteCard}>
          <Ionicons name="document-text" size={20} color={Colors.accent} />
          <Text style={styles.noteText}>
            For questions about these terms, contact legal@finpulse.io
          </Text>
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
  noteCard: {
    flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: Colors.card,
    borderRadius: 16, padding: 18, marginTop: 8,
    borderWidth: 1, borderColor: Colors.border,
  },
  noteText: { flex: 1, fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.medium, lineHeight: 20 },
});
