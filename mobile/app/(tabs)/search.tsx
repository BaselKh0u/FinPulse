import { useEffect, useMemo, useState } from "react";
import {
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
import { searchStocks } from "@/services/stock.service";
import { Stock } from "@/models/Stock";
import { Colors, Fonts } from "@/theme";
import { useTheme } from "@/stores/theme.store";
import { getCurrencySymbol, subscribeCurrency, convertPrice } from "@/stores/currency.store";

export default function SearchScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(createStyles, [isDark]);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Stock[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [cs, setCs] = useState(getCurrencySymbol());
  useEffect(() => subscribeCurrency(() => setCs(getCurrencySymbol())), []);

  useEffect(() => {
    (async () => {
      try {
        const data = await searchStocks(query);
        setResults(data);
        if (query.trim().length > 0) setHasSearched(true);
      } catch {
        // Search failed silently
      }
    })();
  }, [query]);

  function renderItem({ item }: { item: Stock }) {
    const isUp = item.changePercent >= 0;

    return (
      <Pressable
        style={({ pressed }) => [styles.card, pressed && { opacity: 0.92 }]}
        onPress={() => router.push(`/stock/${item.symbol}`)}
      >
        <View style={styles.iconWrap}>
          <Text style={styles.iconText}>{item.symbol.charAt(0)}</Text>
        </View>

        <View style={styles.mid}>
          <Text style={styles.symbol}>{item.symbol}</Text>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        </View>

        <View style={styles.right}>
          <Text style={styles.price}>{cs}{convertPrice(item.price).toFixed(2)}</Text>
          <Text style={[styles.change, isUp ? styles.up : styles.down]}>
            {isUp ? "+" : ""}{item.changePercent.toFixed(2)}%
          </Text>
        </View>
      </Pressable>
    );
  }

  const showEmpty = hasSearched && query.trim().length > 0 && results.length === 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.title}>Search</Text>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color={Colors.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search stock by name or symbol"
          placeholderTextColor={Colors.placeholder}
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <Pressable onPress={() => { setQuery(""); setHasSearched(false); }} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={Colors.textTertiary} />
          </Pressable>
        )}
      </View>

      {results.length > 0 && (
        <Text style={styles.sectionLabel}>
          {query.trim().length > 0 ? "RESULTS" : "TOP RESULTS"}
        </Text>
      )}

      {showEmpty ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="search" size={52} color={Colors.borderLight} />
          <Text style={styles.emptyTitle}>No results found</Text>
          <Text style={styles.emptySub}>Try searching with a different name or symbol.</Text>
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

const createStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  title: { fontSize: 30, color: Colors.textPrimary, fontFamily: Fonts.bold, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16 },
  searchWrap: {
    flexDirection: "row", alignItems: "center", marginHorizontal: 20, marginBottom: 20,
    backgroundColor: Colors.card, borderRadius: 16, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 14, height: 50,
    shadowColor: Colors.shadow, shadowOpacity: 0.03, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.textPrimary, fontFamily: Fonts.regular, height: 50 },
  sectionLabel: { fontSize: 12, color: Colors.textTertiary, fontFamily: Fonts.semiBold, letterSpacing: 1, paddingHorizontal: 20, marginBottom: 12 },
  listContent: { paddingHorizontal: 20, paddingBottom: 30 },
  card: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.card, borderRadius: 18,
    padding: 14, marginBottom: 10,
    shadowColor: Colors.shadow, shadowOpacity: 0.03, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1,
  },
  iconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.iconBackground, alignItems: "center", justifyContent: "center", marginRight: 14 },
  iconText: { fontSize: 18, color: Colors.textPrimary, fontFamily: Fonts.bold },
  mid: { flex: 1 },
  symbol: { fontSize: 17, color: Colors.textPrimary, fontFamily: Fonts.bold },
  name: { marginTop: 3, fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.medium },
  right: { alignItems: "flex-end" },
  price: { fontSize: 17, color: Colors.textPrimary, fontFamily: Fonts.bold },
  change: { marginTop: 3, fontSize: 13, fontFamily: Fonts.bold },
  up: { color: Colors.success },
  down: { color: Colors.danger },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 8 },
  emptyTitle: { fontSize: 18, color: Colors.textPrimary, fontFamily: Fonts.bold, marginTop: 8 },
  emptySub: { fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.medium, textAlign: "center", lineHeight: 20 },
});
