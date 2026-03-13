import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stock } from "../models/Stock";

type Props = {
  item: Stock;
  onPress?: () => void;
};

export default function WatchlistItem({ item, onPress }: Props) {
  const isUp = item.changePercent >= 0;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <View style={styles.leftIcon}>
        <Text style={styles.iconText}>{item.symbol.charAt(0)}</Text>
      </View>

      <View style={styles.mid}>
        <Text style={styles.symbol}>{item.symbol}</Text>
        <Text style={styles.name}>{item.name}</Text>
      </View>

      <View style={styles.right}>
        <Text style={styles.price}>${item.price.toFixed(2)}</Text>
        <Text style={[styles.percent, isUp ? styles.up : styles.down]}>
          {isUp ? "+" : ""}
          {item.changePercent.toFixed(2)}%
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  leftIcon: {
    width: 58,
    height: 58,
    borderRadius: 18,
    backgroundColor: "#EFF2F7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  iconText: { fontSize: 20, fontWeight: "900", color: "#0B1220" },
  mid: { flex: 1 },
  symbol: { fontSize: 20, fontWeight: "900", color: "#0B1220" },
  name: { marginTop: 4, fontSize: 15, fontWeight: "600", color: "#6B758A" },
  right: { alignItems: "flex-end" },
  price: { fontSize: 20, fontWeight: "900", color: "#0B1220" },
  percent: { marginTop: 6, fontSize: 15, fontWeight: "900" },
  up: { color: "#18C08B" },
  down: { color: "#FF4D4F" },
});