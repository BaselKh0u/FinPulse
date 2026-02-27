import { useEffect, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";

import { getStocks } from "../../services/stock.service";
import { Stock } from "../../models/Stock";
import StockCard from "../../components/StockCard";

export default function HomeScreen() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      <Text style={styles.title}>FinPulse 📈</Text>

      <FlatList
        data={stocks}
        keyExtractor={(item) => item.symbol}
        renderItem={({ item }) => <StockCard item={item} />}
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
  title: { fontSize: 28, fontWeight: "700", marginBottom: 16, color: "white" },

  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  error: { color: "red", fontSize: 16, fontWeight: "600" },
  smallText: { opacity: 0.7 },
});