import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AlertType, ALERT_TYPE_CONFIG } from "@/models/Alert";
import { createAlert } from "@/services/alert.service";
import { searchStocks } from "@/services/stock.service";
import { Stock } from "@/models/Stock";
import { Colors, Fonts } from "@/theme";

const ALERT_TYPES: { key: AlertType; icon: string; title: string; sub: string }[] = [
  { key: "price_above", icon: "trending-up", title: "Price Above", sub: "Notify when price rises above target" },
  { key: "price_below", icon: "trending-down", title: "Price Below", sub: "Notify when price drops below target" },
  { key: "volatility", icon: "pulse", title: "Volatility", sub: "Notify on large % change in a day" },
  { key: "earnings", icon: "document-text", title: "Earnings Report", sub: "Notify when earnings report is released" },
];

export default function CreateAlertScreen() {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [stockQuery, setStockQuery] = useState("");
  const [stockResults, setStockResults] = useState<Stock[]>([]);
  const [selectedStock, setSelectedStock] = useState<Stock | null>(null);

  const [selectedType, setSelectedType] = useState<AlertType | null>(null);

  const [targetValue, setTargetValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await searchStocks(stockQuery);
      setStockResults(data);
    })();
  }, [stockQuery]);

  const needsTarget = selectedType === "price_above" || selectedType === "price_below" || selectedType === "volatility";

  const canSave = useMemo(() => {
    if (!selectedStock || !selectedType) return false;
    if (needsTarget && (!targetValue.trim() || isNaN(Number(targetValue)))) return false;
    return !saving;
  }, [selectedStock, selectedType, targetValue, needsTarget, saving]);

  function buildDescription(): string {
    const val = Number(targetValue);
    switch (selectedType) {
      case "price_above": return `Above $${val.toFixed(2)}`;
      case "price_below": return `Below $${val.toFixed(2)}`;
      case "volatility": return `Change > ${val}%`;
      case "earnings": return "Report Released";
      default: return "";
    }
  }

  async function onSave() {
    if (!canSave || !selectedStock || !selectedType) return;
    setSaving(true);
    try {
      await createAlert({
        symbol: selectedStock.symbol,
        type: selectedType,
        targetPrice: selectedType === "price_above" || selectedType === "price_below" ? Number(targetValue) : undefined,
        threshold: selectedType === "volatility" ? Number(targetValue) : undefined,
        description: buildDescription(),
        isActive: true,
      });
      Alert.alert("Alert Created", `You'll be notified about ${selectedStock.symbol}.`, [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch {
      Alert.alert("Error", "Failed to create alert. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function renderStepIndicator() {
    return (
      <View style={styles.steps}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={[styles.stepDot, step >= s && styles.stepDotActive]} />
        ))}
      </View>
    );
  }

  function renderStep1() {
    return (
      <>
        <Text style={styles.stepTitle}>Select Stock</Text>
        <Text style={styles.stepSub}>Choose the stock you want to set an alert for.</Text>

        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={20} color={Colors.textTertiary} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or symbol"
            placeholderTextColor={Colors.placeholder}
            value={stockQuery}
            onChangeText={setStockQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {stockQuery.length > 0 && (
            <Pressable onPress={() => setStockQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={20} color={Colors.textTertiary} />
            </Pressable>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {stockResults.map((stock) => {
            const chosen = selectedStock?.symbol === stock.symbol;
            return (
              <Pressable
                key={stock.symbol}
                style={[styles.stockRow, chosen && styles.stockRowSelected]}
                onPress={() => setSelectedStock(stock)}
              >
                <View style={styles.stockIcon}>
                  <Text style={styles.stockIconText}>{stock.symbol.charAt(0)}</Text>
                </View>
                <View style={styles.stockInfo}>
                  <Text style={styles.stockSymbol}>{stock.symbol}</Text>
                  <Text style={styles.stockName}>{stock.name}</Text>
                </View>
                <Text style={styles.stockPrice}>${stock.price.toFixed(2)}</Text>
                {chosen && <Ionicons name="checkmark-circle" size={22} color={Colors.accent} style={{ marginLeft: 8 }} />}
              </Pressable>
            );
          })}
        </ScrollView>

        <Pressable
          onPress={() => { if (selectedStock) setStep(2); }}
          disabled={!selectedStock}
          style={({ pressed }) => [styles.nextBtn, !selectedStock && styles.btnDisabled, pressed && selectedStock && { opacity: 0.85 }]}
        >
          <Text style={styles.nextBtnText}>Continue</Text>
        </Pressable>
      </>
    );
  }

  function renderStep2() {
    return (
      <>
        <Text style={styles.stepTitle}>Alert Type</Text>
        <Text style={styles.stepSub}>What should we notify you about?</Text>

        <View style={styles.selectedStockBadge}>
          <Text style={styles.badgeSymbol}>{selectedStock?.symbol}</Text>
          <Text style={styles.badgeName}>{selectedStock?.name}</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {ALERT_TYPES.map((t) => {
            const chosen = selectedType === t.key;
            const config = ALERT_TYPE_CONFIG[t.key];
            return (
              <Pressable
                key={t.key}
                style={[styles.typeCard, chosen && { borderColor: config.color, borderWidth: 2 }]}
                onPress={() => setSelectedType(t.key)}
              >
                <View style={[styles.typeIconWrap, { backgroundColor: config.bg }]}>
                  <Ionicons name={t.icon as any} size={22} color={config.color} />
                </View>
                <View style={styles.typeInfo}>
                  <Text style={styles.typeTitle}>{t.title}</Text>
                  <Text style={styles.typeSub}>{t.sub}</Text>
                </View>
                {chosen && <Ionicons name="checkmark-circle" size={22} color={config.color} />}
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.btnRow}>
          <Pressable onPress={() => setStep(1)} style={({ pressed }) => [styles.backStepBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.backStepText}>Back</Text>
          </Pressable>
          <Pressable
            onPress={() => { if (selectedType) setStep(3); }}
            disabled={!selectedType}
            style={({ pressed }) => [styles.nextBtn, styles.nextBtnFlex, !selectedType && styles.btnDisabled, pressed && selectedType && { opacity: 0.85 }]}
          >
            <Text style={styles.nextBtnText}>Continue</Text>
          </Pressable>
        </View>
      </>
    );
  }

  function renderStep3() {
    const config = selectedType ? ALERT_TYPE_CONFIG[selectedType] : null;

    return (
      <>
        <Text style={styles.stepTitle}>Set Condition</Text>
        <Text style={styles.stepSub}>Configure your alert details.</Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Stock</Text>
            <Text style={styles.summaryValue}>{selectedStock?.symbol} — {selectedStock?.name}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Type</Text>
            <View style={[styles.typeBadgeSmall, { backgroundColor: config?.bg }]}>
              <Text style={[styles.typeBadgeText, { color: config?.color }]}>{config?.label}</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Current Price</Text>
            <Text style={styles.summaryValue}>${selectedStock?.price.toFixed(2)}</Text>
          </View>
        </View>

        {needsTarget && (
          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>
              {selectedType === "volatility" ? "Change Threshold (%)" : "Target Price ($)"}
            </Text>
            <TextInput
              style={styles.targetInput}
              placeholder={selectedType === "volatility" ? "e.g. 5" : "e.g. 200.00"}
              placeholderTextColor={Colors.placeholder}
              value={targetValue}
              onChangeText={setTargetValue}
              keyboardType="decimal-pad"
              returnKeyType="done"
            />
            {selectedType !== "volatility" && selectedStock && targetValue && !isNaN(Number(targetValue)) && (
              <Text style={styles.diffText}>
                {Number(targetValue) > selectedStock.price ? "▲" : "▼"}{" "}
                {Math.abs(((Number(targetValue) - selectedStock.price) / selectedStock.price) * 100).toFixed(2)}% from current price
              </Text>
            )}
          </View>
        )}

        {!needsTarget && (
          <View style={styles.inputSection}>
            <View style={styles.autoNote}>
              <Ionicons name="information-circle" size={20} color={Colors.accent} />
              <Text style={styles.autoNoteText}>
                This alert triggers automatically when the earnings report is released. No additional configuration needed.
              </Text>
            </View>
          </View>
        )}

        <View style={styles.btnRow}>
          <Pressable onPress={() => setStep(2)} style={({ pressed }) => [styles.backStepBtn, pressed && { opacity: 0.7 }]}>
            <Text style={styles.backStepText}>Back</Text>
          </Pressable>
          <Pressable
            onPress={onSave}
            disabled={!canSave}
            style={({ pressed }) => [styles.saveBtn, styles.nextBtnFlex, !canSave && styles.btnDisabled, pressed && canSave && { opacity: 0.85 }]}
          >
            <Ionicons name="notifications" size={18} color={Colors.white} />
            <Text style={styles.saveBtnText}>{saving ? "Creating..." : "Create Alert"}</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.closeBtn} hitSlop={10}>
            <Ionicons name="close" size={26} color={Colors.textPrimary} />
          </Pressable>
          <Text style={styles.headerTitle}>New Alert</Text>
          <View style={styles.closeBtnSpacer} />
        </View>

        {renderStepIndicator()}

        <View style={styles.content}>
          {step === 1 && renderStep1()}
          {step === 2 && renderStep2()}
          {step === 3 && renderStep3()}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  closeBtn: { width: 40, height: 40, alignItems: "flex-start", justifyContent: "center" },
  closeBtnSpacer: { width: 40 },
  headerTitle: { fontSize: 18, color: Colors.textPrimary, fontFamily: Fonts.bold },

  steps: { flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 20 },
  stepDot: { width: 32, height: 4, borderRadius: 2, backgroundColor: Colors.divider },
  stepDotActive: { backgroundColor: Colors.accent },

  content: { flex: 1, paddingHorizontal: 20 },

  stepTitle: { fontSize: 24, color: Colors.textPrimary, fontFamily: Fonts.bold },
  stepSub: { fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.medium, marginTop: 6, marginBottom: 20 },

  searchWrap: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.card,
    borderRadius: 14, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 14, height: 48, marginBottom: 16,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.textPrimary, fontFamily: Fonts.regular, height: 48 },

  stockRow: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.card,
    borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: "transparent",
  },
  stockRowSelected: { borderColor: Colors.accent },
  stockIcon: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.iconBackground,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  stockIconText: { fontSize: 16, color: Colors.textPrimary, fontFamily: Fonts.bold },
  stockInfo: { flex: 1 },
  stockSymbol: { fontSize: 16, color: Colors.textPrimary, fontFamily: Fonts.bold },
  stockName: { fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.medium, marginTop: 1 },
  stockPrice: { fontSize: 15, color: Colors.textPrimary, fontFamily: Fonts.bold },

  selectedStockBadge: {
    flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: Colors.card,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 20, alignSelf: "flex-start",
  },
  badgeSymbol: { fontSize: 15, color: Colors.textPrimary, fontFamily: Fonts.bold },
  badgeName: { fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.medium },

  typeCard: {
    flexDirection: "row", alignItems: "center", backgroundColor: Colors.card,
    borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1.5, borderColor: "transparent",
  },
  typeIconWrap: {
    width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", marginRight: 14,
  },
  typeInfo: { flex: 1 },
  typeTitle: { fontSize: 16, color: Colors.textPrimary, fontFamily: Fonts.bold },
  typeSub: { fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.medium, marginTop: 2 },

  summaryCard: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 18, marginBottom: 20,
  },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 },
  summaryLabel: { fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.medium },
  summaryValue: { fontSize: 14, color: Colors.textPrimary, fontFamily: Fonts.semiBold },
  divider: { height: 1, backgroundColor: Colors.divider },

  typeBadgeSmall: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  typeBadgeText: { fontSize: 11, fontFamily: Fonts.bold, letterSpacing: 0.5 },

  inputSection: { marginBottom: 20 },
  inputLabel: { fontSize: 14, color: Colors.textPrimary, fontFamily: Fonts.semiBold, marginBottom: 10 },
  targetInput: {
    height: 54, borderRadius: 14, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 16, fontSize: 20, color: Colors.textPrimary, backgroundColor: Colors.card,
    fontFamily: Fonts.bold, textAlign: "center",
  },
  diffText: { textAlign: "center", marginTop: 8, fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.medium },

  autoNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: "rgba(44,102,255,0.06)",
    borderRadius: 14, padding: 16,
  },
  autoNoteText: { flex: 1, fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.medium, lineHeight: 20 },

  btnRow: { flexDirection: "row", gap: 12, marginTop: "auto", paddingBottom: 10 },
  backStepBtn: {
    height: 54, paddingHorizontal: 24, borderRadius: 16, backgroundColor: Colors.card,
    alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border,
  },
  backStepText: { fontSize: 16, color: Colors.textPrimary, fontFamily: Fonts.semiBold },

  nextBtn: {
    height: 54, borderRadius: 16, backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center", marginTop: "auto", marginBottom: 10,
  },
  nextBtnFlex: { flex: 1, marginTop: 0, marginBottom: 0 },
  nextBtnText: { color: Colors.white, fontSize: 16, fontFamily: Fonts.bold },

  saveBtn: {
    height: 54, borderRadius: 16, backgroundColor: Colors.accent,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  saveBtnText: { color: Colors.white, fontSize: 16, fontFamily: Fonts.bold },

  btnDisabled: { opacity: 0.45 },
});
