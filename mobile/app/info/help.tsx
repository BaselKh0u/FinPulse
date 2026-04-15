import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors, Fonts } from "@/theme";
import { useTheme } from "@/stores/theme.store";

const FAQ = [
  { q: "How do I add stocks to my watchlist?", a: "Navigate to the Home tab and tap 'Add New Stock' at the bottom, or use the Search tab to find a stock and tap the + button." },
  { q: "How do alerts work?", a: "You can set price alerts, volatility alerts, or earnings alerts on any stock. When the condition is met, you'll receive a push notification." },
  { q: "What is the Market Pulse score?", a: "The Market Pulse score aggregates sentiment data from social media and financial news using our NLP engine to provide a real-time overview of market sentiment (0-100 scale)." },
  { q: "How is sentiment analyzed?", a: "We use a FinBERT-based NLP model to analyze text from Twitter/X, Reddit, and financial news sources. Each text is classified as positive, neutral, or negative." },
  { q: "Can I change the app currency?", a: "Yes! Go to Profile > Data > Default Currency and select your preferred currency." },
  { q: "How do I enable biometric login?", a: "Go to Profile > Preferences > Biometric Login and toggle it on. You'll need Face ID or Touch ID enabled on your device." },
];

export default function HelpScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(createStyles, [isDark]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={28} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Help Center</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.heroCard}>
          <Ionicons name="help-buoy" size={40} color={Colors.accent} />
          <Text style={styles.heroTitle}>How can we help?</Text>
          <Text style={styles.heroSub}>Find answers to commonly asked questions below.</Text>
        </View>

        <Text style={styles.sectionLabel}>FREQUENTLY ASKED QUESTIONS</Text>
        {FAQ.map((item, idx) => (
          <View key={idx} style={styles.faqCard}>
            <Text style={styles.question}>{item.q}</Text>
            <Text style={styles.answer}>{item.a}</Text>
          </View>
        ))}

        <View style={styles.contactCard}>
          <Ionicons name="mail-outline" size={24} color={Colors.accent} />
          <View style={{ flex: 1 }}>
            <Text style={styles.contactTitle}>Still need help?</Text>
            <Text style={styles.contactSub}>Contact us at support@finpulse.io</Text>
          </View>
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

  heroCard: {
    backgroundColor: Colors.card, borderRadius: 20, padding: 28, alignItems: "center", marginBottom: 24,
    shadowColor: Colors.shadow, shadowOpacity: 0.04, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  heroTitle: { fontSize: 22, color: Colors.textPrimary, fontFamily: Fonts.bold, marginTop: 12 },
  heroSub: { fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.medium, marginTop: 6, textAlign: "center" },

  sectionLabel: { fontSize: 12, color: Colors.textTertiary, fontFamily: Fonts.semiBold, letterSpacing: 1, marginBottom: 12 },

  faqCard: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 18, marginBottom: 10,
    shadowColor: Colors.shadow, shadowOpacity: 0.02, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1,
  },
  question: { fontSize: 15, color: Colors.textPrimary, fontFamily: Fonts.bold, marginBottom: 8 },
  answer: { fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.regular, lineHeight: 21 },

  contactCard: {
    flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: Colors.card,
    borderRadius: 16, padding: 18, marginTop: 14,
    borderWidth: 1, borderColor: Colors.border,
  },
  contactTitle: { fontSize: 15, color: Colors.textPrimary, fontFamily: Fonts.bold },
  contactSub: { fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.medium, marginTop: 2 },
});
