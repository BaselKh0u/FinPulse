import { useEffect, useMemo, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from "react-native";

import { getStocks } from "../../services/stock.service";
import { Stock } from "../../models/Stock";
import StockCard from "../../components/StockCard";

export default function HomeScreen() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState("");

  async function loadStocks(isRefresh = false) {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      setError(null);
      const data = await getStocks();
      setStocks(data);
    } catch (e) {
      setError("Failed to load stocks");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadStocks();
  }, []);

  const filteredStocks = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stocks;

    return stocks.filter((s) => {
      return (
        s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
      );
    });
  }, [stocks, query]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: "#0b1220" }]}>
        <ActivityIndicator size="large" />
        <Text style={[styles.smallText, { color: "white" }]}>
          Loading stocks...
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: "#0b1220" }]}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: "#0b1220" }]}>
      {/* Header */}
      <Text style={styles.title}>FinPulse 📈</Text>

      {/* Search */}
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search (AAPL, Tesla...)"
        placeholderTextColor="#94a3b8"
        style={styles.search}
        autoCapitalize="none"
        autoCorrect={false}
      />

      <FlatList
        data={filteredStocks}
        keyExtractor={(item) => item.symbol}
        renderItem={({ item }) => <StockCard item={item} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>No results for “{query.trim()}”</Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadStocks(true)}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 12, color: "white" },

  search: {
    backgroundColor: "#0f1a33",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    color: "white",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 14,
    fontSize: 16,
  },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  error: { color: "red", fontSize: 16, fontWeight: "600" },
  smallText: { opacity: 0.7 },

  emptyWrap: { paddingTop: 24, alignItems: "center" },
  emptyText: { color: "#94a3b8", fontSize: 14 },
});