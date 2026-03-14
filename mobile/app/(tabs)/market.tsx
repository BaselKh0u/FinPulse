import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import {
  getMarketData,
  MarketData,
  MarketNewsItem,
  SentimentMover,
  SourceSentiment,
  TrendingStock,
} from "@/services/market.service";
import { Colors, Fonts } from "@/theme";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatMentions(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function getMoodColor(score: number): string {
  if (score >= 0.6) return Colors.success;
  if (score >= 0.4) return Colors.warning;
  return Colors.danger;
}

function getMoodGradient(score: number): string {
  if (score >= 0.6) return Colors.successLight;
  if (score >= 0.4) return Colors.warningLight;
  return Colors.dangerLight;
}

export default function MarketScreen() {
  const router = useRouter();
  const [data, setData] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "positive" | "negative">("all");

  const load = useCallback(async () => {
    const d = await getMarketData();
    setData(d);
  }, []);

  useEffect(() => {
    (async () => {
      try { setLoading(true); await load(); } finally { setLoading(false); }
    })();
  }, [load]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = async () => {
    try { setRefreshing(true); await load(); } finally { setRefreshing(false); }
  };

  if (loading || !data) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  const filteredNews = activeTab === "all"
    ? data.news
    : data.news.filter((n) => n.sentiment === activeTab);

  const gainers = data.movers.filter((m) => m.direction === "up");
  const losers = data.movers.filter((m) => m.direction === "down");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        data={filteredNews}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <>
            {/* Header */}
            <View style={styles.header}>
              <View>
                <Text style={styles.headerTitle}>Market Pulse</Text>
                <Text style={styles.headerSub}>Sentiment & News Analysis</Text>
              </View>
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            </View>

            {/* Market Mood */}
            <View style={[styles.moodCard, { borderLeftColor: getMoodColor(data.mood.score) }]}>
              <View style={styles.moodLeft}>
                <Text style={styles.moodLabel}>Market Sentiment</Text>
                <View style={styles.moodScoreRow}>
                  <Text style={[styles.moodScore, { color: getMoodColor(data.mood.score) }]}>
                    {(data.mood.score * 100).toFixed(0)}
                  </Text>
                  <View style={styles.moodMeta}>
                    <View style={[styles.moodBadge, { backgroundColor: getMoodGradient(data.mood.score) }]}>
                      <Text style={[styles.moodBadgeText, { color: getMoodColor(data.mood.score) }]}>
                        {data.mood.label}
                      </Text>
                    </View>
                    <View style={styles.moodChangeRow}>
                      <Ionicons
                        name={data.mood.change >= 0 ? "arrow-up" : "arrow-down"}
                        size={12}
                        color={data.mood.change >= 0 ? Colors.success : Colors.danger}
                      />
                      <Text style={[styles.moodChangeText, {
                        color: data.mood.change >= 0 ? Colors.success : Colors.danger,
                      }]}>
                        {Math.abs(data.mood.change * 100).toFixed(0)} pts from yesterday
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.moodBar}>
                  <View style={[styles.moodBarFill, {
                    width: `${data.mood.score * 100}%`,
                    backgroundColor: getMoodColor(data.mood.score),
                  }]} />
                </View>
                <View style={styles.moodBarLabels}>
                  <Text style={styles.moodBarLabel}>Fear</Text>
                  <Text style={styles.moodBarLabel}>Neutral</Text>
                  <Text style={styles.moodBarLabel}>Greed</Text>
                </View>
              </View>
            </View>

            {/* Trending Stocks */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Trending Now</Text>
              <View style={styles.mentionHint}>
                <Ionicons name="chatbubbles-outline" size={14} color={Colors.textTertiary} />
                <Text style={styles.mentionHintText}>by social mentions</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendingScroll}>
              {data.trending.map((stock) => (
                <TrendingCard key={stock.symbol} stock={stock} onPress={() => router.push(`/stock/${stock.symbol}`)} />
              ))}
            </ScrollView>

            {/* Source Breakdown */}
            <Text style={styles.sectionTitle}>Sentiment by Source</Text>
            <View style={styles.sourcesCard}>
              {data.sources.map((src, idx) => (
                <View key={src.source}>
                  <SourceRow source={src} />
                  {idx < data.sources.length - 1 && <View style={styles.sourceDivider} />}
                </View>
              ))}
            </View>

            {/* Sentiment Movers */}
            <Text style={styles.sectionTitle}>Sentiment Movers</Text>
            <View style={styles.moversRow}>
              <View style={styles.moversCol}>
                <View style={styles.moversHeader}>
                  <Ionicons name="trending-up" size={16} color={Colors.success} />
                  <Text style={styles.moversHeaderText}>Most Bullish</Text>
                </View>
                {gainers.map((m) => <MoverItem key={m.symbol} mover={m} onPress={() => router.push(`/stock/${m.symbol}`)} />)}
              </View>
              <View style={styles.moversCol}>
                <View style={styles.moversHeader}>
                  <Ionicons name="trending-down" size={16} color={Colors.danger} />
                  <Text style={styles.moversHeaderText}>Most Bearish</Text>
                </View>
                {losers.map((m) => <MoverItem key={m.symbol} mover={m} onPress={() => router.push(`/stock/${m.symbol}`)} />)}
              </View>
            </View>

            {/* News Filter Tabs */}
            <View style={styles.newsHeaderRow}>
              <Text style={styles.sectionTitle}>Latest News</Text>
            </View>
            <View style={styles.newsTabs}>
              {([
                { key: "all" as const, label: "All" },
                { key: "positive" as const, label: "Positive" },
                { key: "negative" as const, label: "Negative" },
              ]).map((t) => (
                <Pressable
                  key={t.key}
                  style={[styles.newsTab, activeTab === t.key && styles.newsTabActive]}
                  onPress={() => setActiveTab(t.key)}
                >
                  <Text style={[styles.newsTabText, activeTab === t.key && styles.newsTabTextActive]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
          </>
        }
        renderItem={({ item }) => <NewsCard item={item} onPress={() => router.push(`/stock/${item.relatedSymbols[0]}`)} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="newspaper-outline" size={48} color={Colors.borderLight} />
            <Text style={styles.emptyText}>No {activeTab} news at the moment.</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
      />
    </SafeAreaView>
  );
}

/* ─── Sub-components ─── */

function TrendingCard({ stock, onPress }: { stock: TrendingStock; onPress: () => void }) {
  const isUp = stock.changePercent >= 0;
  const sentColor = stock.sentimentLabel === "bullish" ? Colors.success
    : stock.sentimentLabel === "bearish" ? Colors.danger : Colors.textTertiary;
  const sentBg = stock.sentimentLabel === "bullish" ? Colors.successLight
    : stock.sentimentLabel === "bearish" ? Colors.dangerLight : Colors.iconBackground;

  return (
    <Pressable style={({ pressed }) => [styles.trendCard, pressed && { opacity: 0.92 }]} onPress={onPress}>
      <View style={styles.trendTop}>
        <View style={styles.trendIconWrap}>
          <Text style={styles.trendIcon}>{stock.symbol.charAt(0)}</Text>
        </View>
        <View style={[styles.trendSentDot, { backgroundColor: sentColor }]} />
      </View>
      <Text style={styles.trendSymbol}>{stock.symbol}</Text>
      <Text style={styles.trendName} numberOfLines={1}>{stock.name}</Text>
      <Text style={styles.trendPrice}>${stock.price.toFixed(2)}</Text>
      <View style={[styles.trendChangePill, { backgroundColor: isUp ? Colors.successLight : Colors.dangerLight }]}>
        <Text style={[styles.trendChangeText, { color: isUp ? Colors.success : Colors.danger }]}>
          {isUp ? "+" : ""}{stock.changePercent.toFixed(2)}%
        </Text>
      </View>
      <View style={styles.trendMentions}>
        <Ionicons name="chatbubble-outline" size={11} color={Colors.textTertiary} />
        <Text style={styles.trendMentionText}>{formatMentions(stock.mentions)}</Text>
      </View>
    </Pressable>
  );
}

function SourceRow({ source }: { source: SourceSentiment }) {
  const total = source.positive + source.neutral + source.negative || 1;
  return (
    <View style={styles.sourceRow}>
      <View style={styles.sourceLeft}>
        <View style={styles.sourceIconWrap}>
          <Ionicons name={source.icon as any} size={20} color={Colors.textSecondary} />
        </View>
        <View>
          <Text style={styles.sourceName}>{source.source}</Text>
          <Text style={styles.sourcePosts}>{formatMentions(source.totalPosts)} posts</Text>
        </View>
      </View>
      <View style={styles.sourceRight}>
        <View style={styles.sourceBarTrack}>
          <View style={[styles.sourceBarSeg, { width: `${(source.positive / total) * 100}%`, backgroundColor: Colors.success }]} />
          <View style={[styles.sourceBarSeg, { width: `${(source.neutral / total) * 100}%`, backgroundColor: Colors.textTertiary }]} />
          <View style={[styles.sourceBarSeg, { width: `${(source.negative / total) * 100}%`, backgroundColor: Colors.danger }]} />
        </View>
        <View style={styles.sourcePctRow}>
          <Text style={[styles.sourcePct, { color: Colors.success }]}>{source.positive}%</Text>
          <Text style={[styles.sourcePct, { color: Colors.textTertiary }]}>{source.neutral}%</Text>
          <Text style={[styles.sourcePct, { color: Colors.danger }]}>{source.negative}%</Text>
        </View>
      </View>
    </View>
  );
}

function MoverItem({ mover, onPress }: { mover: SentimentMover; onPress: () => void }) {
  const isUp = mover.direction === "up";
  return (
    <Pressable style={({ pressed }) => [styles.moverItem, pressed && { opacity: 0.85 }]} onPress={onPress}>
      <View style={styles.moverLeft}>
        <Text style={styles.moverSymbol}>{mover.symbol}</Text>
        <Text style={styles.moverScore}>{mover.currentScore.toFixed(2)}</Text>
      </View>
      <View style={[styles.moverChangePill, { backgroundColor: isUp ? Colors.successLight : Colors.dangerLight }]}>
        <Ionicons name={isUp ? "arrow-up" : "arrow-down"} size={12} color={isUp ? Colors.success : Colors.danger} />
        <Text style={[styles.moverChangeText, { color: isUp ? Colors.success : Colors.danger }]}>
          {Math.abs(mover.change * 100).toFixed(0)}
        </Text>
      </View>
    </Pressable>
  );
}

function NewsCard({ item, onPress }: { item: MarketNewsItem; onPress: () => void }) {
  const sentColor = item.sentiment === "positive" ? Colors.success
    : item.sentiment === "negative" ? Colors.danger : Colors.textTertiary;
  const sentBg = item.sentiment === "positive" ? Colors.successLight
    : item.sentiment === "negative" ? Colors.dangerLight : Colors.iconBackground;

  return (
    <Pressable style={({ pressed }) => [styles.newsCard, pressed && { opacity: 0.92 }]} onPress={onPress}>
      <View style={styles.newsTopRow}>
        <View style={[styles.newsSentDot, { backgroundColor: sentColor }]} />
        <Text style={styles.newsSource}>{item.source}</Text>
        <Text style={styles.newsTime}>{timeAgo(item.publishedAt)}</Text>
      </View>
      <Text style={styles.newsTitle}>{item.title}</Text>
      <Text style={styles.newsSummary} numberOfLines={2}>{item.summary}</Text>
      <View style={styles.newsBottom}>
        <View style={[styles.newsSentBadge, { backgroundColor: sentBg }]}>
          <Text style={[styles.newsSentText, { color: sentColor }]}>
            {item.sentiment.charAt(0).toUpperCase() + item.sentiment.slice(1)}
          </Text>
          <Text style={[styles.newsSentScore, { color: sentColor }]}>
            {item.sentimentScore > 0 ? "+" : ""}{item.sentimentScore.toFixed(2)}
          </Text>
        </View>
        <View style={styles.newsSymbols}>
          {item.relatedSymbols.map((s) => (
            <View key={s} style={styles.newsSymbolChip}>
              <Text style={styles.newsSymbolText}>${s}</Text>
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );
}

/* ─── Styles ─── */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  listContent: { paddingBottom: 30 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16,
  },
  headerTitle: { fontSize: 30, color: Colors.textPrimary, fontFamily: Fonts.bold },
  headerSub: { fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.medium, marginTop: 2 },
  liveBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: Colors.dangerLight, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.danger },
  liveText: { fontSize: 12, color: Colors.danger, fontFamily: Fonts.bold, letterSpacing: 1 },

  moodCard: {
    backgroundColor: Colors.card, marginHorizontal: 20, borderRadius: 20, padding: 20,
    borderLeftWidth: 4, marginBottom: 24,
    shadowColor: Colors.shadow, shadowOpacity: 0.05, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 3,
  },
  moodLeft: { flex: 1 },
  moodLabel: { fontSize: 13, color: Colors.textTertiary, fontFamily: Fonts.semiBold, letterSpacing: 0.5, marginBottom: 8 },
  moodScoreRow: { flexDirection: "row", alignItems: "center", gap: 16, marginBottom: 16 },
  moodScore: { fontSize: 52, fontFamily: Fonts.bold },
  moodMeta: { gap: 6 },
  moodBadge: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 5, borderRadius: 10 },
  moodBadgeText: { fontSize: 14, fontFamily: Fonts.bold },
  moodChangeRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  moodChangeText: { fontSize: 12, fontFamily: Fonts.medium },
  moodBar: {
    height: 8, backgroundColor: Colors.iconBackground, borderRadius: 4, overflow: "hidden",
  },
  moodBarFill: { height: 8, borderRadius: 4 },
  moodBarLabels: {
    flexDirection: "row", justifyContent: "space-between", marginTop: 6,
  },
  moodBarLabel: { fontSize: 11, color: Colors.textTertiary, fontFamily: Fonts.medium },

  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, marginBottom: 14,
  },
  sectionTitle: { fontSize: 20, color: Colors.textPrimary, fontFamily: Fonts.bold, paddingHorizontal: 20, marginBottom: 14 },
  mentionHint: { flexDirection: "row", alignItems: "center", gap: 4, paddingRight: 20 },
  mentionHintText: { fontSize: 12, color: Colors.textTertiary, fontFamily: Fonts.medium },

  trendingScroll: { paddingLeft: 20, paddingRight: 8, paddingBottom: 4, marginBottom: 24 },
  trendCard: {
    width: 152, backgroundColor: Colors.card, borderRadius: 18, padding: 16, marginRight: 12,
    shadowColor: Colors.shadow, shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  trendTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  trendIconWrap: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.iconBackground,
    alignItems: "center", justifyContent: "center",
  },
  trendIcon: { fontSize: 16, color: Colors.textPrimary, fontFamily: Fonts.bold },
  trendSentDot: { width: 10, height: 10, borderRadius: 5 },
  trendSymbol: { fontSize: 16, color: Colors.textPrimary, fontFamily: Fonts.bold },
  trendName: { fontSize: 12, color: Colors.textSecondary, fontFamily: Fonts.medium, marginTop: 2 },
  trendPrice: { fontSize: 17, color: Colors.textPrimary, fontFamily: Fonts.bold, marginTop: 8 },
  trendChangePill: { alignSelf: "flex-start", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 4 },
  trendChangeText: { fontSize: 12, fontFamily: Fonts.bold },
  trendMentions: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 },
  trendMentionText: { fontSize: 11, color: Colors.textTertiary, fontFamily: Fonts.medium },

  sourcesCard: {
    backgroundColor: Colors.card, marginHorizontal: 20, borderRadius: 18, padding: 16, marginBottom: 24,
    shadowColor: Colors.shadow, shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  sourceRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12 },
  sourceLeft: { flexDirection: "row", alignItems: "center", width: 150, gap: 10 },
  sourceIconWrap: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: Colors.iconBackground,
    alignItems: "center", justifyContent: "center",
  },
  sourceName: { fontSize: 14, color: Colors.textPrimary, fontFamily: Fonts.semiBold },
  sourcePosts: { fontSize: 11, color: Colors.textTertiary, fontFamily: Fonts.medium },
  sourceRight: { flex: 1, gap: 6 },
  sourceBarTrack: { height: 8, borderRadius: 4, flexDirection: "row", overflow: "hidden" },
  sourceBarSeg: { height: 8 },
  sourcePctRow: { flexDirection: "row", justifyContent: "space-between" },
  sourcePct: { fontSize: 11, fontFamily: Fonts.bold },
  sourceDivider: { height: 1, backgroundColor: Colors.divider },

  moversRow: { flexDirection: "row", gap: 12, paddingHorizontal: 20, marginBottom: 24 },
  moversCol: {
    flex: 1, backgroundColor: Colors.card, borderRadius: 18, padding: 14,
    shadowColor: Colors.shadow, shadowOpacity: 0.03, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  moversHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  moversHeaderText: { fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.bold },
  moverItem: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  moverLeft: { gap: 2 },
  moverSymbol: { fontSize: 15, color: Colors.textPrimary, fontFamily: Fonts.bold },
  moverScore: { fontSize: 12, color: Colors.textTertiary, fontFamily: Fonts.medium },
  moverChangePill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  moverChangeText: { fontSize: 12, fontFamily: Fonts.bold },

  newsHeaderRow: { marginBottom: 4 },
  newsTabs: {
    flexDirection: "row", gap: 8, paddingHorizontal: 20, marginBottom: 16,
  },
  newsTab: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
    backgroundColor: Colors.iconBackground,
  },
  newsTabActive: { backgroundColor: Colors.primary },
  newsTabText: { fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.semiBold },
  newsTabTextActive: { color: Colors.white, fontFamily: Fonts.bold },

  newsCard: {
    backgroundColor: Colors.card, marginHorizontal: 20, borderRadius: 18, padding: 18, marginBottom: 12,
    shadowColor: Colors.shadow, shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  newsTopRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
  newsSentDot: { width: 8, height: 8, borderRadius: 4 },
  newsSource: { fontSize: 12, color: Colors.textTertiary, fontFamily: Fonts.semiBold },
  newsTime: { fontSize: 12, color: Colors.textTertiary, fontFamily: Fonts.medium, marginLeft: "auto" },
  newsTitle: { fontSize: 16, color: Colors.textPrimary, fontFamily: Fonts.bold, lineHeight: 22, marginBottom: 6 },
  newsSummary: { fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.regular, lineHeight: 19, marginBottom: 12 },
  newsBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  newsSentBadge: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
  },
  newsSentText: { fontSize: 12, fontFamily: Fonts.bold },
  newsSentScore: { fontSize: 11, fontFamily: Fonts.semiBold },
  newsSymbols: { flexDirection: "row", gap: 6 },
  newsSymbolChip: {
    backgroundColor: Colors.iconBackground, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6,
  },
  newsSymbolText: { fontSize: 11, color: Colors.accent, fontFamily: Fonts.bold },

  emptyWrap: { alignItems: "center", paddingVertical: 40, gap: 10 },
  emptyText: { fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.medium },
});
