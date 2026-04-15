import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert as AlertDialog,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LineChart } from "react-native-chart-kit";
import * as Haptics from "expo-haptics";
import { StockDetails, StockNewsItem } from "@/models/Stock";
import { getStockDetails, getStocks, addStock, removeStock } from "@/services/stock.service";
import { getAlerts, deleteAlert } from "@/services/alert.service";
import { Colors, Fonts } from "@/theme";
import { useTheme } from "@/stores/theme.store";
import { getCurrencySymbol, subscribeCurrency, convertPrice } from "@/stores/currency.store";

const CHART_WIDTH = Dimensions.get("window").width - 80;

type TimeRange = "1D" | "1W" | "1M" | "3M" | "1Y" | "ALL";
const TIME_RANGES: TimeRange[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];

function formatNumber(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toLocaleString();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function StockDetailScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(createStyles, [isDark]);

  const [cs, setCs] = useState(getCurrencySymbol());
  useEffect(() => subscribeCurrency(() => setCs(getCurrencySymbol())), []);

  const [details, setDetails] = useState<StockDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState<TimeRange>("1M");
  const [chartData, setChartData] = useState<number[]>([]);
  const [inWatchlist, setInWatchlist] = useState(false);
  const [hasAlert, setHasAlert] = useState(false);
  const [alertId, setAlertId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [data, watchlist, alerts] = await Promise.all([
          getStockDetails(symbol ?? ""),
          getStocks(),
          getAlerts(),
        ]);
        setDetails(data);
        setInWatchlist(watchlist.some((s) => s.symbol.toUpperCase() === (symbol ?? "").toUpperCase()));
        const matchingAlert = alerts.find((a) => a.symbol.toUpperCase() === (symbol ?? "").toUpperCase());
        setHasAlert(!!matchingAlert);
        setAlertId(matchingAlert?.id ?? null);
      } catch {
        // Leave details as null — error UI handles this when loading finishes
      } finally {
        setLoading(false);
      }
    })();
  }, [symbol]);

  async function toggleWatchlist() {
    if (!details) return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (inWatchlist) {
      await removeStock(details.symbol);
      setInWatchlist(false);
    } else {
      await addStock({
        symbol: details.symbol,
        name: details.name,
        price: details.price,
        change: details.change,
        changePercent: details.changePercent,
      });
      setInWatchlist(true);
    }
  }

  async function toggleOrCreateAlert() {
    if (!details) return;
    if (hasAlert && alertId) {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      AlertDialog.alert(
        "Remove Alert",
        `Remove the alert for ${details.symbol}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              await deleteAlert(alertId);
              setHasAlert(false);
              setAlertId(null);
              await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
          },
        ],
      );
    } else {
      router.push({
        pathname: "/create-alert",
        params: { symbol: details.symbol, stockName: details.name, stockPrice: String(details.price) },
      });
    }
  }

  const isUp = (details?.changePercent ?? 0) >= 0;
  const priceColor = isUp ? Colors.success : Colors.danger;

  const sentimentData = useMemo(() => {
    if (!details) return null;
    const { bullish, bearish, neutral } = details.sentiment;
    const total = bullish + bearish + neutral || 1;
    return {
      bullPct: ((bullish / total) * 100).toFixed(0),
      bearPct: ((bearish / total) * 100).toFixed(0),
      neutPct: ((neutral / total) * 100).toFixed(0),
      bullWidth: `${(bullish / total) * 100}%` as const,
      bearWidth: `${(bearish / total) * 100}%` as const,
      neutWidth: `${(neutral / total) * 100}%` as const,
    };
  }, [details]);

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!details) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.7 }}>
            <Ionicons name="chevron-back" size={28} color={Colors.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.loadingWrap}>
          <Text style={styles.errorText}>{"Couldn't load this stock. Check your connection and try again."}</Text>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.errorBackBtn, pressed && { opacity: 0.85 }]}>
            <Text style={styles.errorBackBtnText}>Go back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const stats = details.keyStats;
  const statItems: { label: string; value: string }[] = [
    { label: "Open", value: `${cs}${convertPrice(stats.open).toFixed(2)}` },
    { label: "High", value: `${cs}${convertPrice(stats.high).toFixed(2)}` },
    { label: "Low", value: `${cs}${convertPrice(stats.low).toFixed(2)}` },
    { label: "Volume", value: stats.volume },
    { label: "Avg Volume", value: stats.avgVolume },
    { label: "Market Cap", value: stats.marketCap },
    { label: "P/E Ratio", value: stats.peRatio !== null ? stats.peRatio.toFixed(1) : "N/A" },
    { label: "52W High", value: `${cs}${convertPrice(stats.week52High).toFixed(2)}` },
    { label: "52W Low", value: `${cs}${convertPrice(stats.week52Low).toFixed(2)}` },
    { label: "Beta", value: stats.beta.toFixed(2) },
    { label: "Dividend", value: stats.dividend },
    { label: "Close", value: `${cs}${convertPrice(stats.close).toFixed(2)}` },
  ];

  function renderNewsItem(item: StockNewsItem) {
    const sentColor = item.sentiment === "positive" ? Colors.success
      : item.sentiment === "negative" ? Colors.danger : Colors.textTertiary;
    const sentBg = item.sentiment === "positive" ? Colors.successLight
      : item.sentiment === "negative" ? Colors.dangerLight : Colors.iconBackground;

    return (
      <Pressable key={item.id} style={({ pressed }) => [styles.newsCard, pressed && { opacity: 0.92 }]}>
        <View style={styles.newsTop}>
          <View style={[styles.sentimentDot, { backgroundColor: sentColor }]} />
          <Text style={styles.newsSource}>{item.source}</Text>
          <Text style={styles.newsTime}>{timeAgo(item.publishedAt)}</Text>
        </View>
        <Text style={styles.newsTitle} numberOfLines={2}>{item.title}</Text>
        <View style={[styles.newsSentBadge, { backgroundColor: sentBg }]}>
          <Text style={[styles.newsSentText, { color: sentColor }]}>
            {item.sentiment.charAt(0).toUpperCase() + item.sentiment.slice(1)}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Ionicons name="chevron-back" size={28} color={Colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerSymbol}>{details.symbol}</Text>
          <Text style={styles.headerName} numberOfLines={1}>{details.name}</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable onPress={toggleWatchlist} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.7 }}>
            <Ionicons
              name={inWatchlist ? "bookmark" : "bookmark-outline"}
              size={24}
              color={inWatchlist ? Colors.accent : Colors.textSecondary}
            />
          </Pressable>
          <Pressable onPress={toggleOrCreateAlert} hitSlop={8} style={({ pressed }) => pressed && { opacity: 0.7 }}>
            <Ionicons
              name={hasAlert ? "notifications" : "notifications-outline"}
              size={24}
              color={hasAlert ? Colors.warning : Colors.textSecondary}
            />
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.priceSection}>
          <Text style={styles.priceMain}>{cs}{convertPrice(details.price).toFixed(2)}</Text>
          <View style={styles.changeRow}>
            <Ionicons name={isUp ? "trending-up" : "trending-down"} size={20} color={priceColor} />
            <Text style={[styles.changeAmount, { color: priceColor }]}>
              {isUp ? "+" : ""}{details.change.toFixed(2)}
            </Text>
            <View style={[styles.changePill, { backgroundColor: isUp ? Colors.successLight : Colors.dangerLight }]}>
              <Text style={[styles.changePillText, { color: priceColor }]}>
                {isUp ? "+" : ""}{details.changePercent.toFixed(2)}%
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.chartCard}>
          {details.chartData.length >= 2 ? (
            <LineChart
              data={{
                labels: [],
                datasets: [{ data: details.chartData, color: () => priceColor, strokeWidth: 2.5 }],
              }}
              width={CHART_WIDTH}
              height={180}
              withDots={false}
              withInnerLines={false}
              withOuterLines={false}
              withHorizontalLabels={true}
              withVerticalLabels={false}
              chartConfig={{
                backgroundColor: Colors.card,
                backgroundGradientFrom: Colors.card,
                backgroundGradientTo: Colors.card,
                decimalPlaces: 2,
                color: () => priceColor,
                labelColor: () => Colors.textTertiary,
                propsForBackgroundLines: { stroke: Colors.divider, strokeDasharray: "4 4" },
                propsForLabels: { fontFamily: Fonts.medium, fontSize: 11 },
              }}
              bezier
              style={styles.chart}
            />
          ) : (
            <View style={{ height: 180, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: Colors.textTertiary, fontFamily: Fonts.medium }}>No chart data</Text>
            </View>
          )}
          <View style={styles.rangeRow}>
            {TIME_RANGES.map((r) => (
              <Pressable
                key={r}
                onPress={() => { setSelectedRange(r); Haptics.selectionAsync(); }}
                style={[styles.rangeBtn, selectedRange === r && styles.rangeBtnActive]}
              >
                <Text style={[styles.rangeText, selectedRange === r && styles.rangeTextActive]}>{r}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.actionsRow}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, inWatchlist ? styles.actionBtnSuccess : styles.actionBtnPrimary, pressed && { opacity: 0.85 }]}
            onPress={toggleWatchlist}
          >
            <Ionicons name={inWatchlist ? "checkmark-circle" : "bookmark-outline"} size={18} color={Colors.white} />
            <Text style={styles.actionTextPrimary}>{inWatchlist ? "In Watchlist" : "Add to Watchlist"}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.actionBtnOutline, pressed && { opacity: 0.85 }]}
            onPress={toggleOrCreateAlert}
          >
            <Ionicons name={hasAlert ? "notifications" : "notifications-outline"} size={18} color={Colors.accent} />
            <Text style={styles.actionTextOutline}>{hasAlert ? "Remove Alert" : "Set Alert"}</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionTitle}>Key Statistics</Text>
        <View style={styles.statsGrid}>
          {statItems.map((s) => (
            <View key={s.label} style={styles.statCell}>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={styles.statValue}>{s.value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Social Sentiment</Text>
        <View style={styles.sentimentCard}>
          <View style={styles.sentHeaderRow}>
            <View style={styles.sentScoreWrap}>
              <Text style={styles.sentScoreLabel}>Score</Text>
              <Text style={[styles.sentScore, {
                color: details.sentiment.score >= 0.5 ? Colors.success
                  : details.sentiment.score >= 0.2 ? Colors.warning : Colors.danger,
              }]}>{details.sentiment.score.toFixed(2)}</Text>
            </View>
            <View style={styles.sentMetaCol}>
              <View style={styles.sentMetaRow}>
                <Ionicons name="chatbubbles-outline" size={15} color={Colors.textTertiary} />
                <Text style={styles.sentMetaText}>{formatNumber(details.sentiment.mentions)} mentions</Text>
              </View>
              {details.sentiment.trending && (
                <View style={styles.trendingBadge}>
                  <Ionicons name="flame" size={13} color={Colors.warning} />
                  <Text style={styles.trendingText}>Trending</Text>
                </View>
              )}
            </View>
          </View>

          {sentimentData && (
            <View style={styles.sentBars}>
              <View style={styles.sentBarRow}>
                <Text style={[styles.sentBarLabel, { color: Colors.success }]}>Bullish</Text>
                <View style={styles.sentBarTrack}>
                  <View style={[styles.sentBarFill, { width: sentimentData.bullWidth, backgroundColor: Colors.success }]} />
                </View>
                <Text style={styles.sentBarPct}>{sentimentData.bullPct}%</Text>
              </View>
              <View style={styles.sentBarRow}>
                <Text style={[styles.sentBarLabel, { color: Colors.textTertiary }]}>Neutral</Text>
                <View style={styles.sentBarTrack}>
                  <View style={[styles.sentBarFill, { width: sentimentData.neutWidth, backgroundColor: Colors.textTertiary }]} />
                </View>
                <Text style={styles.sentBarPct}>{sentimentData.neutPct}%</Text>
              </View>
              <View style={styles.sentBarRow}>
                <Text style={[styles.sentBarLabel, { color: Colors.danger }]}>Bearish</Text>
                <View style={styles.sentBarTrack}>
                  <View style={[styles.sentBarFill, { width: sentimentData.bearWidth, backgroundColor: Colors.danger }]} />
                </View>
                <Text style={styles.sentBarPct}>{sentimentData.bearPct}%</Text>
              </View>
            </View>
          )}
        </View>

        {details.news.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Latest News</Text>
            {details.news.map(renderNewsItem)}
          </>
        )}

        <Text style={styles.sectionTitle}>About {details.symbol}</Text>
        <View style={styles.aboutCard}>
          <Text style={styles.aboutText}>{details.description}</Text>
          <View style={styles.aboutDivider} />
          <View style={styles.aboutGrid}>
            <View style={styles.aboutItem}>
              <Text style={styles.aboutLabel}>Sector</Text>
              <Text style={styles.aboutValue}>{details.sector}</Text>
            </View>
            <View style={styles.aboutItem}>
              <Text style={styles.aboutLabel}>Industry</Text>
              <Text style={styles.aboutValue}>{details.industry}</Text>
            </View>
            <View style={styles.aboutItem}>
              <Text style={styles.aboutLabel}>Employees</Text>
              <Text style={styles.aboutValue}>{details.employees}</Text>
            </View>
            <View style={styles.aboutItem}>
              <Text style={styles.aboutLabel}>Headquarters</Text>
              <Text style={styles.aboutValue}>{details.headquarters}</Text>
            </View>
          </View>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20, paddingBottom: 20 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  errorText: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontFamily: Fonts.medium,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  errorBackBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },
  errorBackBtnText: { color: Colors.white, fontSize: 15, fontFamily: Fonts.bold },

  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  headerCenter: { flex: 1, marginLeft: 8 },
  headerSymbol: { fontSize: 20, color: Colors.textPrimary, fontFamily: Fonts.bold },
  headerName: { fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.medium, marginTop: 1 },
  headerRight: { flexDirection: "row", gap: 16 },

  priceSection: { marginTop: 8, marginBottom: 4 },
  priceMain: { fontSize: 42, color: Colors.textPrimary, fontFamily: Fonts.bold },
  changeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  changeAmount: { fontSize: 18, fontFamily: Fonts.bold },
  changePill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  changePillText: { fontSize: 14, fontFamily: Fonts.bold },

  chartCard: {
    backgroundColor: Colors.card, borderRadius: 20, padding: 20, marginTop: 20, alignItems: "center",
    shadowColor: Colors.shadow, shadowOpacity: 0.04, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  chart: { borderRadius: 16, marginHorizontal: -8 },
  rangeRow: { flexDirection: "row", gap: 4, marginTop: 20, backgroundColor: Colors.iconBackground, borderRadius: 12, padding: 4 },
  rangeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  rangeBtnActive: { backgroundColor: Colors.card, shadowColor: Colors.shadow, shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  rangeText: { fontSize: 13, color: Colors.textTertiary, fontFamily: Fonts.semiBold },
  rangeTextActive: { color: Colors.textPrimary, fontFamily: Fonts.bold },

  actionsRow: { flexDirection: "row", gap: 12, marginTop: 20 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 48, borderRadius: 14 },
  actionBtnPrimary: { backgroundColor: Colors.primary },
  actionBtnSuccess: { backgroundColor: Colors.success },
  actionBtnOutline: { backgroundColor: Colors.card, borderWidth: 1.5, borderColor: Colors.border },
  actionTextPrimary: { color: Colors.white, fontSize: 14, fontFamily: Fonts.bold },
  actionTextOutline: { color: Colors.accent, fontSize: 14, fontFamily: Fonts.bold },

  sectionTitle: { fontSize: 20, color: Colors.textPrimary, fontFamily: Fonts.bold, marginTop: 28, marginBottom: 14 },

  statsGrid: {
    flexDirection: "row", flexWrap: "wrap", backgroundColor: Colors.card, borderRadius: 18, padding: 4,
    shadowColor: Colors.shadow, shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  statCell: { width: "50%", paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: Colors.divider },
  statLabel: { fontSize: 12, color: Colors.textTertiary, fontFamily: Fonts.medium, marginBottom: 4 },
  statValue: { fontSize: 15, color: Colors.textPrimary, fontFamily: Fonts.bold },

  sentimentCard: {
    backgroundColor: Colors.card, borderRadius: 18, padding: 20,
    shadowColor: Colors.shadow, shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  sentHeaderRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  sentScoreWrap: { alignItems: "center" },
  sentScoreLabel: { fontSize: 12, color: Colors.textTertiary, fontFamily: Fonts.medium },
  sentScore: { fontSize: 36, fontFamily: Fonts.bold, marginTop: 2 },
  sentMetaCol: { justifyContent: "center", alignItems: "flex-end", gap: 6 },
  sentMetaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  sentMetaText: { fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.medium },
  trendingBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.warningLight, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8,
  },
  trendingText: { fontSize: 12, color: Colors.warning, fontFamily: Fonts.bold },

  sentBars: { gap: 14 },
  sentBarRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  sentBarLabel: { width: 56, fontSize: 13, fontFamily: Fonts.semiBold },
  sentBarTrack: { flex: 1, height: 10, backgroundColor: Colors.iconBackground, borderRadius: 5, overflow: "hidden" },
  sentBarFill: { height: 10, borderRadius: 5 },
  sentBarPct: { width: 36, textAlign: "right", fontSize: 13, color: Colors.textPrimary, fontFamily: Fonts.bold },

  newsCard: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 16, marginBottom: 10,
    shadowColor: Colors.shadow, shadowOpacity: 0.03, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  newsTop: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  sentimentDot: { width: 8, height: 8, borderRadius: 4 },
  newsSource: { fontSize: 12, color: Colors.textTertiary, fontFamily: Fonts.semiBold },
  newsTime: { fontSize: 12, color: Colors.textTertiary, fontFamily: Fonts.medium, marginLeft: "auto" },
  newsTitle: { fontSize: 15, color: Colors.textPrimary, fontFamily: Fonts.semiBold, lineHeight: 21, marginBottom: 10 },
  newsSentBadge: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  newsSentText: { fontSize: 11, fontFamily: Fonts.bold },
  stabilityCard: {
    backgroundColor: Colors.card, borderRadius: 18, padding: 20,
    shadowColor: Colors.shadow, shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  stabilityScore: { fontSize: 34, color: Colors.primary, fontFamily: Fonts.bold },
  stabilityDescription: { marginTop: 6, fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.medium, lineHeight: 19 },
  confidenceText: { marginTop: 8, fontSize: 13, color: Colors.textPrimary, fontFamily: Fonts.semiBold },

  aboutCard: {
    backgroundColor: Colors.card, borderRadius: 18, padding: 20,
    shadowColor: Colors.shadow, shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  aboutText: { fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.regular, lineHeight: 22 },
  aboutDivider: { height: 1, backgroundColor: Colors.divider, marginVertical: 16 },
  aboutGrid: { flexDirection: "row", flexWrap: "wrap" },
  aboutItem: { width: "50%", marginBottom: 14 },
  aboutLabel: { fontSize: 12, color: Colors.textTertiary, fontFamily: Fonts.medium, marginBottom: 3 },
  aboutValue: { fontSize: 14, color: Colors.textPrimary, fontFamily: Fonts.semiBold },
});
