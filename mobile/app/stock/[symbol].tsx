import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StockDetails, StockNewsItem } from "@/models/Stock";
import { getStockDetails } from "@/services/stock.service";
import { Colors, Fonts } from "@/theme";

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

function MiniChart({ data, color, width, height }: { data: number[]; color: string; width: number; height: number }) {
  if (data.length < 2) return <View style={{ width, height }} />;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const points = data.map((v, i) => `${i * stepX},${height - ((v - min) / range) * (height - 16) - 8}`).join(" ");

  return (
    <View style={{ width, height, overflow: "hidden" }}>
      <View style={{ position: "absolute", top: 0, left: 0 }}>
        <Svg width={width} height={height}>
          <Polyline points={points} stroke={color} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
        </Svg>
      </View>
    </View>
  );
}

function Svg({ width, height, children }: { width: number; height: number; children: React.ReactNode }) {
  return <View style={{ width, height }}>{children}</View>;
}

function Polyline({ points, stroke, strokeWidth }: { points: string; stroke: string; strokeWidth: number; fill: string; strokeLinejoin: string }) {
  const parsed = points.split(" ").map((p) => {
    const [x, y] = p.split(",").map(Number);
    return { x, y };
  });

  return (
    <>
      {parsed.map((point, i) => {
        if (i === 0) return null;
        const prev = parsed[i - 1];
        const dx = point.x - prev.x;
        const dy = point.y - prev.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              left: prev.x,
              top: prev.y - strokeWidth / 2,
              width: len,
              height: strokeWidth,
              backgroundColor: stroke,
              transform: [{ rotate: `${angle}deg` }],
              transformOrigin: "left center",
              borderRadius: strokeWidth / 2,
            }}
          />
        );
      })}
      <View style={{
        position: "absolute",
        left: parsed[parsed.length - 1].x - 5,
        top: parsed[parsed.length - 1].y - 5,
        width: 10, height: 10, borderRadius: 5,
        backgroundColor: stroke,
        borderWidth: 2.5, borderColor: Colors.white,
      }} />
    </>
  );
}

export default function StockDetailScreen() {
  const { symbol } = useLocalSearchParams<{ symbol: string }>();
  const router = useRouter();

  const [details, setDetails] = useState<StockDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState<TimeRange>("1M");
  const [inWatchlist, setInWatchlist] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const data = await getStockDetails(symbol ?? "");
        setDetails(data);
      } finally {
        setLoading(false);
      }
    })();
  }, [symbol]);

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

  if (loading || !details) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const stats = details.keyStats;
  const statItems: { label: string; value: string }[] = [
    { label: "Open", value: `$${stats.open.toFixed(2)}` },
    { label: "High", value: `$${stats.high.toFixed(2)}` },
    { label: "Low", value: `$${stats.low.toFixed(2)}` },
    { label: "Volume", value: stats.volume },
    { label: "Avg Volume", value: stats.avgVolume },
    { label: "Market Cap", value: stats.marketCap },
    { label: "P/E Ratio", value: stats.peRatio !== null ? stats.peRatio.toFixed(1) : "N/A" },
    { label: "52W High", value: `$${stats.week52High.toFixed(2)}` },
    { label: "52W Low", value: `$${stats.week52Low.toFixed(2)}` },
    { label: "Beta", value: stats.beta.toFixed(2) },
    { label: "Dividend", value: stats.dividend },
    { label: "Close", value: `$${stats.close.toFixed(2)}` },
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
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <Ionicons name="chevron-back" size={28} color={Colors.textPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerSymbol}>{details.symbol}</Text>
          <Text style={styles.headerName} numberOfLines={1}>{details.name}</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => setInWatchlist(!inWatchlist)}
            hitSlop={8}
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            <Ionicons
              name={inWatchlist ? "bookmark" : "bookmark-outline"}
              size={24}
              color={inWatchlist ? Colors.accent : Colors.textSecondary}
            />
          </Pressable>
          <Pressable
            onPress={() => router.push("/create-alert")}
            hitSlop={8}
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            <Ionicons name="notifications-outline" size={24} color={Colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* Price Section */}
        <View style={styles.priceSection}>
          <Text style={styles.priceMain}>${details.price.toFixed(2)}</Text>
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

        {/* Chart */}
        <View style={styles.chartCard}>
          <MiniChart data={details.chartData} color={priceColor} width={320} height={160} />
          <View style={styles.rangeRow}>
            {TIME_RANGES.map((r) => (
              <Pressable
                key={r}
                onPress={() => setSelectedRange(r)}
                style={[styles.rangeBtn, selectedRange === r && styles.rangeBtnActive]}
              >
                <Text style={[styles.rangeText, selectedRange === r && styles.rangeTextActive]}>{r}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.actionBtnPrimary, pressed && { opacity: 0.85 }]}
            onPress={() => setInWatchlist(!inWatchlist)}
          >
            <Ionicons name={inWatchlist ? "bookmark" : "bookmark-outline"} size={18} color={Colors.white} />
            <Text style={styles.actionTextPrimary}>{inWatchlist ? "In Watchlist" : "Add to Watchlist"}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, styles.actionBtnOutline, pressed && { opacity: 0.85 }]}
            onPress={() => router.push("/create-alert")}
          >
            <Ionicons name="notifications-outline" size={18} color={Colors.primary} />
            <Text style={styles.actionTextOutline}>Set Alert</Text>
          </Pressable>
        </View>

        {/* Key Statistics */}
        <Text style={styles.sectionTitle}>Key Statistics</Text>
        <View style={styles.statsGrid}>
          {statItems.map((s) => (
            <View key={s.label} style={styles.statCell}>
              <Text style={styles.statLabel}>{s.label}</Text>
              <Text style={styles.statValue}>{s.value}</Text>
            </View>
          ))}
        </View>

        {/* Sentiment Analysis */}
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

        {/* Latest News */}
        {details.news.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Latest News</Text>
            {details.news.map(renderNewsItem)}
          </>
        )}

        {/* About */}
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 20, paddingBottom: 20 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingVertical: 12,
  },
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
    backgroundColor: Colors.card, borderRadius: 20, padding: 20, marginTop: 20,
    alignItems: "center",
    shadowColor: Colors.shadow, shadowOpacity: 0.04, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  rangeRow: {
    flexDirection: "row", gap: 4, marginTop: 20,
    backgroundColor: Colors.iconBackground, borderRadius: 12, padding: 4,
  },
  rangeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  rangeBtnActive: { backgroundColor: Colors.white, shadowColor: Colors.shadow, shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  rangeText: { fontSize: 13, color: Colors.textTertiary, fontFamily: Fonts.semiBold },
  rangeTextActive: { color: Colors.textPrimary, fontFamily: Fonts.bold },

  actionsRow: { flexDirection: "row", gap: 12, marginTop: 20 },
  actionBtn: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, height: 48, borderRadius: 14,
  },
  actionBtnPrimary: { backgroundColor: Colors.primary },
  actionBtnOutline: { backgroundColor: Colors.card, borderWidth: 1.5, borderColor: Colors.border },
  actionTextPrimary: { color: Colors.white, fontSize: 14, fontFamily: Fonts.bold },
  actionTextOutline: { color: Colors.primary, fontSize: 14, fontFamily: Fonts.bold },

  sectionTitle: {
    fontSize: 20, color: Colors.textPrimary, fontFamily: Fonts.bold,
    marginTop: 28, marginBottom: 14,
  },

  statsGrid: {
    flexDirection: "row", flexWrap: "wrap", backgroundColor: Colors.card,
    borderRadius: 18, padding: 4,
    shadowColor: Colors.shadow, shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  statCell: {
    width: "50%", paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: Colors.divider,
  },
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
