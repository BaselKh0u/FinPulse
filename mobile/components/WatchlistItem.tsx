import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Stock } from "@/models/Stock";
import { Colors, Fonts } from "@/theme";
import { getCurrencySymbol, subscribeCurrency, convertPrice } from "@/stores/currency.store";
import { useTheme } from "@/stores/theme.store";

type Props = {
  item: Stock;
  onPress?: () => void;
};

export default function WatchlistItem({ item, onPress }: Props) {
  const { isDark } = useTheme();
  const styles = useMemo(createStyles, [isDark]);
  const [cs, setCs] = useState(getCurrencySymbol());
  useEffect(() => subscribeCurrency(() => setCs(getCurrencySymbol())), []);
  const isUp = item.changePercent >= 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
    >
      <View style={styles.leftIcon}>
        <Text style={styles.iconText}>{item.symbol.charAt(0)}</Text>
      </View>

      <View style={styles.mid}>
        <Text style={styles.symbol}>{item.symbol}</Text>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
      </View>

      <View style={styles.right}>
        <Text style={styles.price}>{cs}{convertPrice(item.price).toFixed(2)}</Text>
        <Text style={[styles.percent, isUp ? styles.up : styles.down]}>
          {isUp ? "+" : ""}{item.changePercent.toFixed(2)}%
        </Text>
      </View>
    </Pressable>
  );
}

const createStyles = () => StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.card,
    borderRadius: 20, padding: 16, marginBottom: 12,
    shadowColor: Colors.shadow, shadowOpacity: 0.04, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 2,
  },
  leftIcon: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: Colors.iconBackground,
    alignItems: "center", justifyContent: "center", marginRight: 14,
  },
  iconText: { fontSize: 20, color: Colors.textPrimary, fontFamily: Fonts.bold },
  mid: { flex: 1 },
  symbol: { fontSize: 18, color: Colors.textPrimary, fontFamily: Fonts.bold },
  name: { marginTop: 3, fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.medium },
  right: { alignItems: "flex-end" },
  price: { fontSize: 18, color: Colors.textPrimary, fontFamily: Fonts.bold },
  percent: { marginTop: 4, fontSize: 14, fontFamily: Fonts.bold },
  up: { color: Colors.success },
  down: { color: Colors.danger },
});
