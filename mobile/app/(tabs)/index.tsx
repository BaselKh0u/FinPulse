import { useEffect, useState } from "react";
import { StyleSheet, Text, View, FlatList, ActivityIndicator } from "react-native";

import { getStocks } from "../../services/stock.service";
import { Stock } from "../../models/Stock";

export default function HomeScreen() {
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await getStocks();
        setStocks(data);
      } catch (e) {
        setError("Failed to load stocks");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.smallText}>Loading stocks...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>FinPulse 📈</Text>

      <FlatList
        data={stocks}
        keyExtractor={(item) => item.symbol}
        renderItem={({ item }) => {
          const isUp = item.change >= 0;
          return (
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.symbol}>{item.symbol}</Text>
                <Text style={styles.name}>{item.name}</Text>
              </View>

              <View style={styles.row}>
                <Text style={styles.price}>${item.price.toFixed(2)}</Text>
                <Text style={[styles.change, isUp ? styles.up : styles.down]}>
                  {isUp ? "+" : ""}
                  {item.change.toFixed(2)} ({isUp ? "+" : ""}
                  {item.changePercent.toFixed(2)}%)
                </Text>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 16 },
  card: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ddd",
    marginBottom: 12,
    backgroundColor: "white",
  },
  row: { flexDirection: "row", justifyContent: "space-between", marginBottom: 6 },
  symbol: { fontSize: 18, fontWeight: "700" },
  name: { fontSize: 14, opacity: 0.7, flex: 1, textAlign: "right" },
  price: { fontSize: 18, fontWeight: "600" },
  change: { fontSize: 14, fontWeight: "600" },
  up: { color: "green" },
  down: { color: "red" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  error: { color: "red", fontSize: 16, fontWeight: "600" },
  smallText: { opacity: 0.7 },
});