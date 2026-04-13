import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Colors, Fonts } from "@/theme";
import { useTheme } from "@/stores/theme.store";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NewsDetailScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(createStyles, [isDark]);
  const params = useLocalSearchParams<{
    title: string;
    summary: string;
    source: string;
    publishedAt: string;
    sentiment: string;
    sentimentScore: string;
    symbols: string;
    url: string;
  }>();

  const sentColor = params.sentiment === "positive" ? Colors.success
    : params.sentiment === "negative" ? Colors.danger : Colors.textTertiary;
  const sentBg = params.sentiment === "positive" ? Colors.successLight
    : params.sentiment === "negative" ? Colors.dangerLight : Colors.iconBackground;
  const score = parseFloat(params.sentimentScore ?? "0");
  const symbols = (params.symbols ?? "").split(",").filter(Boolean);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Ionicons name="chevron-back" size={28} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>News Article</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.metaRow}>
          <View style={[styles.sentDot, { backgroundColor: sentColor }]} />
          <Text style={styles.source}>{params.source}</Text>
          <Text style={styles.date}>{formatDate(params.publishedAt ?? "")}</Text>
        </View>

        <Text style={styles.title}>{params.title}</Text>

        <View style={styles.badgeRow}>
          <View style={[styles.sentBadge, { backgroundColor: sentBg }]}>
            <Ionicons
              name={params.sentiment === "positive" ? "trending-up" : params.sentiment === "negative" ? "trending-down" : "remove"}
              size={14}
              color={sentColor}
            />
            <Text style={[styles.sentText, { color: sentColor }]}>
              {(params.sentiment ?? "neutral").charAt(0).toUpperCase() + (params.sentiment ?? "neutral").slice(1)}
            </Text>
            <Text style={[styles.sentScore, { color: sentColor }]}>
              {score > 0 ? "+" : ""}{score.toFixed(2)}
            </Text>
          </View>
        </View>

        {symbols.length > 0 && (
          <View style={styles.symbolRow}>
            <Text style={styles.symbolLabel}>Related Stocks</Text>
            <View style={styles.symbolChips}>
              {symbols.map((s) => (
                <Pressable
                  key={s}
                  style={({ pressed }) => [styles.symbolChip, pressed && { opacity: 0.8 }]}
                  onPress={() => router.push(`/stock/${s}`)}
                >
                  <Text style={styles.symbolChipText}>${s}</Text>
                  <Ionicons name="chevron-forward" size={12} color={Colors.accent} />
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.divider} />

        <Text style={styles.body}>{params.summary}</Text>

        <View style={styles.noteCard}>
          <Ionicons name="information-circle" size={20} color={Colors.accent} />
          <Text style={styles.noteText}>
            Full article content will be available when connected to the backend news API. The sentiment analysis is powered by our FinBERT NLP model.
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

  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  sentDot: { width: 10, height: 10, borderRadius: 5 },
  source: { fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.semiBold },
  date: { fontSize: 12, color: Colors.textTertiary, fontFamily: Fonts.medium, marginLeft: "auto" },

  title: { fontSize: 24, color: Colors.textPrimary, fontFamily: Fonts.bold, lineHeight: 32, marginBottom: 16 },

  badgeRow: { marginBottom: 20 },
  sentBadge: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
  },
  sentText: { fontSize: 14, fontFamily: Fonts.bold },
  sentScore: { fontSize: 13, fontFamily: Fonts.semiBold },

  symbolRow: { marginBottom: 20 },
  symbolLabel: { fontSize: 13, color: Colors.textTertiary, fontFamily: Fonts.semiBold, letterSpacing: 0.5, marginBottom: 10 },
  symbolChips: { flexDirection: "row", gap: 8 },
  symbolChip: {
    flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.card,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.border,
  },
  symbolChipText: { fontSize: 14, color: Colors.accent, fontFamily: Fonts.bold },

  divider: { height: 1, backgroundColor: Colors.divider, marginBottom: 20 },

  body: {
    fontSize: 16, color: Colors.textPrimary, fontFamily: Fonts.regular, lineHeight: 26, marginBottom: 24,
  },

  noteCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 10,
    backgroundColor: "rgba(44,102,255,0.06)", borderRadius: 14, padding: 16,
  },
  noteText: { flex: 1, fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.medium, lineHeight: 20 },
});
