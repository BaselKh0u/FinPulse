import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { getStocks, removeStock } from "@/services/stock.service";
import { getMarketData, TrendingStock } from "@/services/market.service";
import { Stock } from "@/models/Stock";
import { Colors, Fonts } from "@/theme";

export default function WatchlistScreen() {
  const router = useRouter();

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [trending, setTrending] = useState<TrendingStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadStocks = useCallback(async () => {
    const [data, marketData] = await Promise.all([getStocks(), getMarketData()]);
    setStocks(data);
    setTrending(marketData.trending);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await loadStocks();
      } finally {
        setLoading(false);
      }
    })();
  }, [loadStocks]);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await loadStocks();
    } finally {
      setRefreshing(false);
    }
  };

  function confirmRemove(symbol: string) {
    Alert.alert(
      "Remove from Watchlist",
      `Are you sure you want to remove ${symbol}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            await removeStock(symbol);
            await loadStocks();
          },
        },
      ]
    );
  }

  function renderItem({ item }: { item: Stock }) {
    const isUp = item.changePercent >= 0;

    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
        onPress={() => router.push(`/stock/${item.symbol}`)}
      >
        <View style={styles.iconWrap}>
          <Text style={styles.iconText}>{item.symbol.charAt(0)}</Text>
        </View>

        <View style={styles.mid}>
          <Text style={styles.symbol}>{item.symbol}</Text>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        </View>

        <View style={styles.right}>
          <Text style={styles.price}>${item.price.toFixed(2)}</Text>
          <View style={[styles.changeBadge, isUp ? styles.badgeUp : styles.badgeDown]}>
            <Text style={[styles.changeText, isUp ? styles.textUp : styles.textDown]}>
              {isUp ? "+" : ""}{item.changePercent.toFixed(2)}%
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => confirmRemove(item.symbol)}
          style={styles.removeBtn}
          hitSlop={8}
        >
          <Ionicons name="close-circle" size={22} color={Colors.textTertiary} />
        </Pressable>
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Watchlist</Text>
        <Pressable
          onPress={() => router.push("/watchlist/add")}
          style={({ pressed }) => [styles.addHeaderBtn, pressed && { opacity: 0.7 }]}
          hitSlop={10}
        >
          <Ionicons name="add" size={26} color={Colors.accent} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>Loading watchlist...</Text>
        </View>
      ) : stocks.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="eye-off-outline" size={56} color={Colors.borderLight} />
          <Text style={styles.emptyTitle}>No stocks yet</Text>
          <Text style={styles.emptySub}>
            Add stocks to your watchlist to track them here.
          </Text>
          <Pressable
            onPress={() => router.push("/watchlist/add")}
            style={({ pressed }) => [styles.emptyBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.emptyBtnText}>Add Stock</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={stocks}
          keyExtractor={(item) => item.symbol}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          ListHeaderComponent={
            stocks.length > 0 ? (
              <WatchlistInsights stocks={stocks} trending={trending} />
            ) : null
          }
          ListFooterComponent={
            <Text style={styles.countText}>
              {stocks.length} stock{stocks.length !== 1 ? "s" : ""} in your watchlist
            </Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

function WatchlistInsights({ stocks, trending }: { stocks: Stock[]; trending: TrendingStock[] }) {
  const watchedSymbols = new Set(stocks.map((s) => s.symbol.toUpperCase()));
  const matched = trending.filter((t) => watchedSymbols.has(t.symbol.toUpperCase()));

  const avgSentiment = matched.length > 0
    ? matched.reduce((sum, t) => sum + t.sentimentScore, 0) / matched.length
    : 0;

  const bullish = matched.filter((t) => t.sentimentLabel === "bullish").length;
  const bearish = matched.filter((t) => t.sentimentLabel === "bearish").length;
  const neutral = matched.length - bullish - bearish;

  const topGainer = stocks.reduce((best, s) => s.changePercent > best.changePercent ? s : best, stocks[0]);

  if (matched.length === 0) return null;

  const sentColor = avgSentiment >= 0.6 ? Colors.success : avgSentiment >= 0.4 ? Colors.warning : Colors.danger;

  return (
    <View style={insightStyles.card}>
      <Text style={insightStyles.title}>Watchlist Insights</Text>
      <View style={insightStyles.row}>
        <View style={insightStyles.stat}>
          <Text style={insightStyles.statLabel}>Avg Sentiment</Text>
          <Text style={[insightStyles.statValue, { color: sentColor }]}>{(avgSentiment * 100).toFixed(0)}</Text>
        </View>
        <View style={insightStyles.divider} />
        <View style={insightStyles.stat}>
          <Text style={insightStyles.statLabel}>Bullish</Text>
          <Text style={[insightStyles.statValue, { color: Colors.success }]}>{bullish}</Text>
        </View>
        <View style={insightStyles.divider} />
        <View style={insightStyles.stat}>
          <Text style={insightStyles.statLabel}>Bearish</Text>
          <Text style={[insightStyles.statValue, { color: Colors.danger }]}>{bearish}</Text>
        </View>
        <View style={insightStyles.divider} />
        <View style={insightStyles.stat}>
          <Text style={insightStyles.statLabel}>Neutral</Text>
          <Text style={[insightStyles.statValue, { color: Colors.textTertiary }]}>{neutral}</Text>
        </View>
      </View>
      <View style={insightStyles.topRow}>
        <Ionicons name="trending-up" size={14} color={Colors.success} />
        <Text style={insightStyles.topText}>Top performer: </Text>
        <Text style={insightStyles.topSymbol}>{topGainer.symbol}</Text>
        <Text style={[insightStyles.topChange, { color: topGainer.changePercent >= 0 ? Colors.success : Colors.danger }]}>
          {topGainer.changePercent >= 0 ? "+" : ""}{topGainer.changePercent.toFixed(2)}%
        </Text>
      </View>
    </View>
  );
}

const insightStyles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card, borderRadius: 18, padding: 16, marginBottom: 16,
    shadowColor: Colors.shadow, shadowOpacity: 0.04, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  title: { fontSize: 14, color: Colors.textTertiary, fontFamily: Fonts.semiBold, letterSpacing: 0.5, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", marginBottom: 14 },
  stat: { alignItems: "center" },
  statLabel: { fontSize: 11, color: Colors.textTertiary, fontFamily: Fonts.medium, marginBottom: 4 },
  statValue: { fontSize: 22, fontFamily: Fonts.bold },
  divider: { width: 1, height: 30, backgroundColor: Colors.divider },
  topRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: Colors.divider },
  topText: { fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.medium },
  topSymbol: { fontSize: 13, color: Colors.textPrimary, fontFamily: Fonts.bold },
  topChange: { fontSize: 13, fontFamily: Fonts.bold, marginLeft: 4 },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  backBtn: { width: 40, height: 40, justifyContent: "center" },
  headerTitle: {
    fontSize: 20,
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
  },
  addHeaderBtn: { width: 40, height: 40, alignItems: "flex-end", justifyContent: "center" },

  listContent: { paddingHorizontal: 18, paddingBottom: 30 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: Colors.iconBackground,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconText: {
    fontSize: 18,
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
  },
  mid: { flex: 1 },
  symbol: {
    fontSize: 17,
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
  },
  name: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: Fonts.medium,
  },
  right: { alignItems: "flex-end", marginRight: 8 },
  price: {
    fontSize: 17,
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
  },
  changeBadge: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeUp: { backgroundColor: Colors.successLight },
  badgeDown: { backgroundColor: Colors.dangerLight },
  changeText: {
    fontSize: 13,
    fontFamily: Fonts.bold,
  },
  textUp: { color: Colors.success },
  textDown: { color: Colors.danger },

  removeBtn: {
    padding: 4,
  },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 14,
  },

  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 20,
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
    marginTop: 8,
  },
  emptySub: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontFamily: Fonts.medium,
    textAlign: "center",
    lineHeight: 20,
  },
  emptyBtn: {
    marginTop: 14,
    height: 48,
    paddingHorizontal: 32,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBtnText: {
    color: Colors.white,
    fontSize: 15,
    fontFamily: Fonts.bold,
  },

  countText: {
    textAlign: "center",
    color: Colors.textTertiary,
    fontSize: 13,
    fontFamily: Fonts.medium,
    marginTop: 8,
    paddingBottom: 10,
  },
});
