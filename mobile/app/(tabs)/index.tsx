import { useEffect, useMemo, useState } from "react";
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
import { useRouter } from "expo-router";

import { getStocks } from "@/services/stock.service";
import { Stock } from "@/models/Stock";
import WatchlistItem from "@/components/WatchlistItem";

export default function HomeScreen() {
  const router = useRouter();

  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadStocks() {
    const data = await getStocks();
    setStocks(data);
  }

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        await loadStocks();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const onRefresh = async () => {
    try {
      setRefreshing(true);
      await loadStocks();
    } finally {
      setRefreshing(false);
    }
  };

  const top3 = useMemo(() => stocks.slice(0, 3), [stocks]);

  // Mock “Total Balance” (later: calculate from real portfolio)
  const totalBalance = 24592.4;
  const todayDelta = 1294;
  const todayPercent = 5.5;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={styles.brandRow}>
            <View style={styles.logoBox}>
              <Text style={styles.logoBars}>▮▮</Text>
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

        {/* Balance Card */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Balance</Text>

          <Text style={styles.balanceValue}>
            $
            {totalBalance.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Text>

          <View style={styles.balanceBottom}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>
                ↗ +${todayDelta.toLocaleString()} ({todayPercent.toFixed(1)}%)
              </Text>
            </View>

            <Text style={styles.todayText}>Today</Text>
          </View>
        </View>

        {/* Watchlist title */}
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

        {/* Loading state (nice, professional) */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Loading your watchlist...</Text>
          </View>
        ) : (
          <FlatList
            data={top3}
            keyExtractor={(item) => item.symbol}
            renderItem={({ item }) => <WatchlistItem item={item} />}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListFooterComponent={
              <Pressable
                onPress={() => router.push("/watchlist/add")}
                style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.9 }]}
              >
                <Text style={styles.addPlus}>＋</Text>
                <Text style={styles.addText}>Add New Stock</Text>
              </Pressable>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#F6F7FB" },

  container: {
    flex: 1,
    backgroundColor: "#F6F7FB",
    paddingHorizontal: 18,
    paddingTop: 10,
  },

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: "#0B1220",
    alignItems: "center",
    justifyContent: "center",
  },
  logoBars: { color: "#FFFFFF", fontWeight: "900" },
  brand: { fontSize: 30, fontWeight: "900", color: "#0B1220" },

  avatarWrap: {
    width: 46,
    height: 46,
    borderRadius: 23,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "rgba(0,0,0,0.06)",
  },
  avatar: { width: 46, height: 46 },

  balanceCard: {
    backgroundColor: "#0B1220",
    borderRadius: 28,
    padding: 22,
    marginBottom: 22,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  balanceLabel: { fontSize: 18, fontWeight: "700", color: "#A7B0C0" },
  balanceValue: { marginTop: 10, fontSize: 46, fontWeight: "900", color: "#FFFFFF" },

  balanceBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
  },
  pill: {
    backgroundColor: "rgba(24, 192, 139, 0.18)",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  pillText: { color: "#18C08B", fontWeight: "900", fontSize: 16 },
  todayText: { color: "#6B758A", fontWeight: "800", fontSize: 16 },

  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  sectionTitle: { fontSize: 34, fontWeight: "900", color: "#0B1220" },
  seeAll: { fontSize: 18, fontWeight: "900", color: "#2C66FF" },

  listContent: { paddingBottom: 18 },

  addBtn: {
    marginTop: 8,
    borderRadius: 22,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#C9D1E1",
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  addPlus: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#E9EDF6",
    textAlign: "center",
    textAlignVertical: "center",
    fontSize: 22,
    fontWeight: "900",
    color: "#6B758A",
  },
  addText: { fontSize: 20, fontWeight: "900", color: "#6B758A" },

  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingBottom: 40,
  },
  loadingText: { color: "#6B758A", fontWeight: "700" },
});