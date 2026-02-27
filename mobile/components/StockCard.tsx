import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Stock } from "../models/Stock";

type Props = {
  item: Stock;
};

export default function StockCard({ item }: Props) {
  const isUp = item.change >= 0;

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        <Text style={styles.symbol}>{item.symbol}</Text>
        <Text style={styles.name}>{item.name}</Text>
      </View>

      <View style={styles.right}>
        <Text style={styles.price}>${item.price.toFixed(2)}</Text>

        <Text style={[styles.change, isUp ? styles.up : styles.down]}>
          {isUp ? "▲" : "▼"} {item.change.toFixed(2)} ({item.changePercent.toFixed(2)}%)
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#121826",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#1f2a44",
  },
  left: {
    flex: 1,
  },
  right: {
    alignItems: "flex-end",
  },
  symbol: {
    color: "white",
    fontSize: 20,
    fontWeight: "800",
  },
  name: {
    color: "#9aa4b2",
    marginTop: 4,
    fontSize: 14,
  },
  price: {
    color: "white",
    fontSize: 20,
    fontWeight: "700",
  },
  change: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: "700",
  },
  up: {
    color: "#00d084",
  },
  down: {
    color: "#ff4d4d",
  },
});