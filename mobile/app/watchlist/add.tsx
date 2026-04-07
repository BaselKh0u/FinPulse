import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { addStock, getStocks, searchStocks } from "@/services/stock.service";
import { Stock } from "@/models/Stock";
import { Colors, Fonts } from "@/theme";

export default function AddStockScreen() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Stock[]>([]);
  const [watchlistSymbols, setWatchlistSymbols] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [all, watchlist] = await Promise.all([
          searchStocks(""),
          getStocks(),
        ]);
        setResults(all);
        setWatchlistSymbols(new Set(watchlist.map((s) => s.symbol.toUpperCase())));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const data = await searchStocks(query);
      setResults(data);
    })();
  }, [query]);

  async function onAdd(stock: Stock) {
    await addStock(stock);
    setWatchlistSymbols((prev) => new Set(prev).add(stock.symbol.toUpperCase()));
    Alert.alert("Added", `${stock.symbol} has been added to your watchlist.`);
  }

  function renderItem({ item }: { item: Stock }) {
    const isUp = item.changePercent >= 0;
    const alreadyAdded = watchlistSymbols.has(item.symbol.toUpperCase());

    return (
      <View style={styles.card}>
        <View style={styles.iconWrap}>
          <Text style={styles.iconText}>{item.symbol.charAt(0)}</Text>
        </View>

        <View style={styles.mid}>
          <Text style={styles.symbol}>{item.symbol}</Text>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        </View>

        <View style={styles.priceCol}>
          <Text style={styles.price}>${item.price.toFixed(2)}</Text>
          <Text style={[styles.changeText, isUp ? styles.textUp : styles.textDown]}>
            {isUp ? "+" : ""}{item.changePercent.toFixed(2)}%
          </Text>
        </View>

        {alreadyAdded ? (
          <View style={styles.addedBadge}>
            <Ionicons name="checkmark" size={18} color={Colors.success} />
          </View>
        ) : (
          <Pressable
            onPress={() => onAdd(item)}
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="add" size={20} color={Colors.white} />
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="chevron-back" size={26} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Add Stock</Text>
        <View style={styles.spacer} />
      </View>

      <View style={styles.searchWrap}>
        <Ionicons
          name="search-outline"
          size={20}
          color={Colors.textTertiary}
          style={styles.searchIcon}
        />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or symbol"
          placeholderTextColor={Colors.placeholder}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => setQuery("")} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={Colors.textTertiary} />
          </Pressable>
        )}
      </View>

      {!loading && results.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="search" size={48} color={Colors.borderLight} />
          <Text style={styles.emptyText}>No results found for "{query}"</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.symbol}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </SafeAreaView>
  );
}

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
  spacer: { width: 40 },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 18,
    marginBottom: 16,
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    height: 48,
  },
  searchIcon: { marginRight: 10 },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    fontFamily: Fonts.regular,
    height: 48,
  },

  listContent: { paddingHorizontal: 18, paddingBottom: 30 },

  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.card,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    shadowColor: Colors.shadow,
    shadowOpacity: 0.03,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.iconBackground,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  iconText: {
    fontSize: 17,
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
  },
  mid: { flex: 1 },
  symbol: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
  },
  name: {
    marginTop: 2,
    fontSize: 13,
    color: Colors.textSecondary,
    fontFamily: Fonts.medium,
  },
  priceCol: { alignItems: "flex-end", marginRight: 12 },
  price: {
    fontSize: 16,
    color: Colors.textPrimary,
    fontFamily: Fonts.bold,
  },
  changeText: {
    marginTop: 2,
    fontSize: 13,
    fontFamily: Fonts.semiBold,
  },
  textUp: { color: Colors.success },
  textDown: { color: Colors.danger },

  addBtn: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  addedBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: Colors.successLight,
    alignItems: "center",
    justifyContent: "center",
  },

  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textSecondary,
    fontFamily: Fonts.medium,
    textAlign: "center",
  },
});
