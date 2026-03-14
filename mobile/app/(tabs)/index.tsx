import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useRouter } from "expo-router";
import { getStocks } from "@/services/stock.service";
import { getMarketData, MarketMood } from "@/services/market.service";
import { Stock } from "@/models/Stock";
import WatchlistItem from "@/components/WatchlistItem";
import { Colors, Fonts } from "@/theme";

const MOCK_BALANCE = 24592.4;
const MOCK_DELTA = 1294;
const MOCK_PERCENT = 5.5;

export default function HomeScreen() {
  const router = useRouter();

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [mood, setMood] = useState<MarketMood | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    const [stocksData, marketData] = await Promise.all([getStocks(), getMarketData()]);
    setStocks(stocksData);
    setMood(marketData.mood);
  }, []);

  useEffect(() => {
    (async () => {
      try { setLoading(true); await loadAll(); } finally { setLoading(false); }
    })();
  }, [loadAll]);

  const onRefresh = async () => {
    try { setRefreshing(true); await loadAll(); } finally { setRefreshing(false); }
  };

  const top3 = useMemo(() => stocks.slice(0, 3), [stocks]);

  const isPositive = MOCK_DELTA >= 0;

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
            <Image
              source={{ uri: "https://i.pravatar.cc/150?img=12" }}
              style={styles.avatar}
            />
          </Pressable>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Balance</Text>
          <Text style={styles.balanceValue}>
            ${MOCK_BALANCE.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>
          <View style={styles.balanceBottom}>
            <View style={[styles.pill, !isPositive && styles.pillNegative]}>
              <Text style={[styles.pillText, !isPositive && styles.pillTextNegative]}>
                {isPositive ? "↗" : "↘"} {isPositive ? "+" : "-"}$
                {Math.abs(MOCK_DELTA).toLocaleString()} ({MOCK_PERCENT.toFixed(1)}%)
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
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
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

const styles = StyleSheet.create({
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
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  brand: {
    fontSize: 26,
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
  },

  avatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: Colors.divider,
  },
  avatar: { width: 44, height: 44 },

  balanceCard: {
    backgroundColor: Colors.primary,
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
    color: Colors.textTertiary,
    fontFamily: Fonts.semiBold,
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
    color: Colors.textSecondary,
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
  pulseRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  pulseBar: { height: 6, backgroundColor: Colors.iconBackground, borderRadius: 3, overflow: "hidden" },
  pulseBarFill: { height: 6, borderRadius: 3 },

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
    backgroundColor: "rgba(255,255,255,0.6)",
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
