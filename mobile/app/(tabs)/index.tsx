import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  FlatList,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { getStocks } from "@/services/stock.service";
import { getMarketData, MarketMood } from "@/services/market.service";
import { getPortfolioSummary } from "@/services/portfolio.service";
import { getDataIngestionConfig, type DataIngestionConfig } from "@/services/config.service";
import { Stock } from "@/models/Stock";
import WatchlistItem from "@/components/WatchlistItem";
import { Colors, Fonts } from "@/theme";
import { getAvatarUri, subscribeAvatarUri } from "@/stores/avatar.store";
import { useTheme } from "@/stores/theme.store";
import { getCurrencySymbol, subscribeCurrency, convertPrice } from "@/stores/currency.store";
import { getRefreshMs, subscribeRefresh } from "@/stores/refresh.store";

function ingestionScheduleSubtitle(cfg: DataIngestionConfig): string {
  if (cfg.alphaVantageCooldownActive) {
    return `Using cached DB data until ${new Date(cfg.alphaVantageBlockedUntilUtc ?? "").toLocaleString()}`;
  }
  const q = cfg.quotePollingIntervalMinutes ?? cfg.pollingIntervalMinutes;
  const ext = cfg.extendedPollingIntervalMinutes ?? cfg.pollingIntervalMinutes;
  const split = cfg.runExtendedIngestionJob !== false && ext !== q;
  return split
    ? `Server cache: prices ~${q} min · news/social ~${ext} min`
    : `Server refresh schedule: every ${cfg.pollingIntervalMinutes} min`;
}

export default function HomeScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(createStyles, [isDark]);

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [mood, setMood] = useState<MarketMood | null>(null);
  const [marketRetrievedAt, setMarketRetrievedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [portfolioSummary, setPortfolioSummary] = useState<{
    totalBalance: number;
    todayChange: number;
    todayChangePercent: number;
  } | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(getAvatarUri());
  const [currSymbol, setCurrSymbol] = useState(getCurrencySymbol());
  const [ingestionConfig, setIngestionConfig] = useState<DataIngestionConfig | null>(null);

  useEffect(() => {
    return subscribeAvatarUri((uri) => setAvatarUri(uri));
  }, []);

  useEffect(() => {
    return subscribeCurrency(() => setCurrSymbol(getCurrencySymbol()));
  }, []);

  const loadAll = useCallback(async () => {
    const [stocksData, marketData, summary, ingestCfg] = await Promise.all([
      getStocks(),
      getMarketData(),
      getPortfolioSummary().catch(() => null),
      getDataIngestionConfig().catch(() => null),
    ]);
    setStocks(stocksData);
    setMood(marketData.mood);
    setMarketRetrievedAt(marketData.retrievedAt ?? marketData.mood?.updatedAt ?? null);
    setPortfolioSummary(summary);
    setIngestionConfig(ingestCfg);
  }, []);

  useEffect(() => {
    (async () => {
      try { setLoading(true); await loadAll(); } finally { setLoading(false); }
    })();
  }, [loadAll]);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    refreshTimer.current = setInterval(() => { loadAll(); }, getRefreshMs());
    const unsub = subscribeRefresh((ms) => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      refreshTimer.current = setInterval(() => { loadAll(); }, ms);
    });
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      unsub();
    };
  }, [loadAll]);

  const onRefresh = async () => {
    try { setRefreshing(true); await loadAll(); } finally { setRefreshing(false); }
  };

  const top3 = useMemo(() => stocks.slice(0, 3), [stocks]);

  /**
   * 1 share per watchlist symbol (same as `stocks` from the API).
   * - Total $ = sum of last prices (each `change` must be signed: losers subtract).
   * - Combined % = sum(changes) / sum(price − change) × 100 — portfolio-style for equal weight.
   *   Do not average or sum `changePercent` across symbols (wrong: different bases per stock).
   */
  const watchlistSnapshot = useMemo(() => {
    if (!stocks.length) {
      return { totalConverted: 0, changeConverted: 0, pct: 0 };
    }
    let totalUsd = 0;
    let changeUsd = 0;
    for (const s of stocks) {
      totalUsd += s.price;
      changeUsd += s.change;
    }
    const prevUsd = totalUsd - changeUsd;
    const pct = prevUsd > 1e-6 ? (changeUsd / prevUsd) * 100 : 0;
    const totalConverted = stocks.reduce((acc, s) => acc + convertPrice(s.price), 0);
    const changeConverted = stocks.reduce((acc, s) => acc + convertPrice(s.change), 0);
    return { totalConverted, changeConverted, pct };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currSymbol updates when currency changes; convertPrice() reads module FX state
  }, [stocks, currSymbol]);

  const summaryPositive = (portfolioSummary?.todayChange ?? 0) >= 0;
  const totalBalanceDisplay = portfolioSummary
    ? convertPrice(portfolioSummary.totalBalance)
    : watchlistSnapshot.totalConverted;
  const todayChangeDisplay = portfolioSummary
    ? convertPrice(portfolioSummary.todayChange)
    : watchlistSnapshot.changeConverted;
  const todayPctDisplay = portfolioSummary
    ? portfolioSummary.todayChangePercent
    : watchlistSnapshot.pct;

  function renderHeader() {
    return (
      <>
        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            <View style={styles.logoBox}>
              <Ionicons name="stats-chart" size={22} color={Colors.white} />
            </View>
            <Text style={styles.brand}>FinPulse</Text>
          </View>

          <Pressable
            onPress={() => router.push("/(tabs)/profile")}
            style={({ pressed }) => [styles.avatarWrap, pressed && { opacity: 0.85 }]}
            hitSlop={10}
          >
            {avatarUri ? (
              <Image
                source={{ uri: avatarUri }}
                style={styles.avatar}
                onError={() => setAvatarUri(null)}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <Ionicons name="person" size={22} color={Colors.textTertiary} />
              </View>
            )}
          </Pressable>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Watchlist snapshot</Text>
          <Text style={styles.balanceValue}>
            {currSymbol}
            {totalBalanceDisplay.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
          <View style={styles.balanceBottom}>
            <View style={[styles.pill, !summaryPositive && styles.pillNegative]}>
              <Text style={[styles.pillText, !summaryPositive && styles.pillTextNegative]}>
                {summaryPositive ? "↗" : "↘"} {summaryPositive ? "+" : "-"}
                {currSymbol}
                {Math.abs(todayChangeDisplay).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                ({todayPctDisplay >= 0 ? "+" : ""}
                {todayPctDisplay.toFixed(1)}%)
              </Text>
            </View>
            <Text style={styles.todayText}>Today</Text>
          </View>
        </View>

        {/* Market Pulse Card */}
        {mood && (
          <Pressable
            onPress={() => router.push("/(tabs)/market")}
            style={({ pressed }) => [styles.pulseCard, pressed && { opacity: 0.92 }]}
          >
            <View style={styles.pulseLeft}>
              <View style={styles.pulseIconWrap}>
                <Ionicons name="pulse" size={20} color={Colors.accent} />
              </View>
              <View>
                <Text style={styles.pulseLabel}>Market Pulse</Text>
                <Text style={styles.pulseSub}>{mood.label} · Score {(mood.score * 100).toFixed(0)}</Text>
                {marketRetrievedAt && (
                  <Text style={styles.pulseMeta}>
                    Last retrieved {new Date(marketRetrievedAt).toLocaleString()}
                  </Text>
                )}
              </View>
            </View>
            <View style={styles.pulseRight}>
              <View style={[styles.pulseBar, { width: 80 }]}>
                <View style={[styles.pulseBarFill, {
                  width: `${mood.score * 100}%`,
                  backgroundColor: mood.score >= 0.6 ? Colors.success : mood.score >= 0.4 ? Colors.warning : Colors.danger,
                }]} />
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.textTertiary} />
            </View>
          </Pressable>
        )}
        {ingestionConfig && (
          <View style={[styles.providerBanner, ingestionConfig.alphaVantageCooldownActive && styles.providerBannerWarn]}>
            <Ionicons
              name={ingestionConfig.alphaVantageCooldownActive ? "warning-outline" : "cloud-done-outline"}
              size={16}
              color={ingestionConfig.alphaVantageCooldownActive ? Colors.warning : Colors.success}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.providerTitle}>
                {ingestionConfig.alphaVantageCooldownActive
                  ? "Live provider cooling down"
                  : "Live provider status healthy"}
              </Text>
              <Text style={styles.providerText}>
                {ingestionScheduleSubtitle(ingestionConfig)}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.sectionRow}>
          <Text style={styles.sectionTitle}>Watchlist</Text>
          <Pressable
            onPress={() => router.push("/watchlist")}
            hitSlop={10}
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            <Text style={styles.seeAll}>See All</Text>
          </Pressable>
        </View>
      </>
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.container}>
          {renderHeader()}
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={styles.loadingText}>Loading your watchlist...</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        data={top3}
        keyExtractor={(item) => item.symbol}
        renderItem={({ item }) => (
          <View style={styles.listPadding}>
            <WatchlistItem item={item} onPress={() => router.push(`/stock/${item.symbol}`)} />
          </View>
        )}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} colors={[Colors.accent]} />
        }
        ListHeaderComponent={
          <View style={styles.container}>{renderHeader()}</View>
        }
        ListFooterComponent={
          <View style={styles.listPadding}>
            <Pressable
              onPress={() => router.push("/watchlist/add")}
              style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.addIconWrap}>
                <Ionicons name="add" size={20} color={Colors.textSecondary} />
              </View>
              <Text style={styles.addText}>Add New Stock</Text>
            </Pressable>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const createStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  container: {
    paddingHorizontal: 18,
    paddingTop: 10,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.logoBox,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontSize: 26,
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
  },

  avatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: Colors.iconBackground,
  },
  avatar: { width: 40, height: 40 },
  avatarFallback: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.iconBackground,
    alignItems: "center", justifyContent: "center",
  },

  balanceCard: {
    backgroundColor: Colors.balanceCard,
    borderRadius: 24,
    padding: 22,
    marginBottom: 24,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  balanceLabel: {
    fontSize: 16,
    color: "rgba(255,255,255,0.6)",
    fontFamily: Fonts.bold,
  },
  balanceValue: {
    marginTop: 8,
    fontSize: 40,
    color: Colors.white,
    fontFamily: Fonts.bold,
  },
  balanceBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
  },
  pill: {
    backgroundColor: Colors.successLight,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  pillNegative: { backgroundColor: Colors.dangerLight },
  pillText: {
    color: Colors.success,
    fontSize: 14,
    fontFamily: Fonts.bold,
  },
  pillTextNegative: { color: Colors.danger },
  todayText: {
    color: "rgba(255,255,255,0.5)",
    fontSize: 14,
    fontFamily: Fonts.semiBold,
  },

  pulseCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pulseLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  pulseIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(44,102,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  pulseLabel: { fontSize: 15, color: Colors.textPrimary, fontFamily: Fonts.bold },
  pulseSub: { fontSize: 12, color: Colors.textSecondary, fontFamily: Fonts.medium, marginTop: 2 },
  pulseMeta: { fontSize: 11, color: Colors.textTertiary, fontFamily: Fonts.medium, marginTop: 3 },
  pulseRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  pulseBar: { height: 6, backgroundColor: Colors.iconBackground, borderRadius: 3, overflow: "hidden" },
  pulseBarFill: { height: 6, borderRadius: 3 },
  providerBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  providerBannerWarn: {
    borderColor: Colors.warning,
    backgroundColor: Colors.warningLight,
  },
  providerTitle: { fontSize: 13, color: Colors.textPrimary, fontFamily: Fonts.semiBold },
  providerText: { marginTop: 2, fontSize: 12, color: Colors.textSecondary, fontFamily: Fonts.medium, lineHeight: 17 },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 28,
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
  },
  seeAll: {
    fontSize: 16,
    color: Colors.accent,
    fontFamily: Fonts.bold,
  },

  listPadding: { paddingHorizontal: 18 },
  listContent: { paddingBottom: 24 },

  addBtn: {
    marginTop: 4,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: Colors.borderLight,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: Colors.card,
  },
  addIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.iconBackgroundAlt,
    alignItems: "center",
    justifyContent: "center",
  },
  addText: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontFamily: Fonts.bold,
  },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingVertical: 60,
  },
  loadingText: {
    color: Colors.textSecondary,
    fontFamily: Fonts.medium,
    fontSize: 14,
  },
});
