import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useFocusEffect } from "expo-router";
import { Swipeable } from "react-native-gesture-handler";
import { getAlerts, toggleAlert, deleteAlert } from "@/services/alert.service";
import { Alert as AlertModel, AlertType, ALERT_TYPE_CONFIG } from "@/models/Alert";
import { Colors, Fonts } from "@/theme";
import { useTheme } from "@/stores/theme.store";
import * as Haptics from "expo-haptics";

type SortBy = "newest" | "oldest" | "symbol";
type FilterStatus = "all" | "active" | "inactive";
type FilterType = "all" | AlertType;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AlertsScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const styles = useMemo(createStyles, [isDark]);

  const [alerts, setAlerts] = useState<AlertModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [showFilter, setShowFilter] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("newest");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterType, setFilterType] = useState<FilterType>("all");

  const loadAlerts = useCallback(async () => {
    const data = await getAlerts();
    setAlerts(data);
  }, []);

  useEffect(() => {
    (async () => {
      try { setLoading(true); await loadAlerts(); } finally { setLoading(false); }
    })();
  }, [loadAlerts]);

  useFocusEffect(useCallback(() => { loadAlerts(); }, [loadAlerts]));

  const onRefresh = async () => {
    try { setRefreshing(true); await loadAlerts(); } finally { setRefreshing(false); }
  };

  const filtered = useMemo(() => {
    let list = [...alerts];
    if (filterStatus === "active") list = list.filter((a) => a.isActive);
    if (filterStatus === "inactive") list = list.filter((a) => !a.isActive);
    if (filterType !== "all") list = list.filter((a) => a.type === filterType);
    if (sortBy === "newest") list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (sortBy === "oldest") list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    if (sortBy === "symbol") list.sort((a, b) => a.symbol.localeCompare(b.symbol));
    return list;
  }, [alerts, sortBy, filterStatus, filterType]);

  const activeCount = useMemo(() => alerts.filter((a) => a.isActive).length, [alerts]);

  const hasActiveFilters = filterStatus !== "all" || filterType !== "all" || sortBy !== "newest";

  async function onToggle(id: string, value: boolean) {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const previous = alerts;
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, isActive: value } : a)));
    try {
      await toggleAlert(id, value);
    } catch (e) {
      setAlerts(previous);
      Alert.alert("Update failed", e instanceof Error ? e.message : "Couldn't update alert. Please try again.");
    }
  }

  async function onSwipeDelete(alert: AlertModel) {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await deleteAlert(alert.id);
      setAlerts((prev) => prev.filter((a) => a.id !== alert.id));
    } catch {
      Alert.alert("Error", "Failed to delete alert. Please try again.");
    }
  }

  function renderItem({ item }: { item: AlertModel }) {
    return (
      <SwipeableAlertCard
        item={item}
        styles={styles}
        onPress={() => router.push(`/stock/${item.symbol}`)}
        onToggle={onToggle}
        onDelete={() => onSwipeDelete(item)}
      />
    );
  }

  function renderFilterModal() {
    const sortOptions: { key: SortBy; label: string }[] = [
      { key: "newest", label: "Newest First" },
      { key: "oldest", label: "Oldest First" },
      { key: "symbol", label: "By Symbol (A–Z)" },
    ];
    const statusOptions: { key: FilterStatus; label: string }[] = [
      { key: "all", label: "All" },
      { key: "active", label: "Active Only" },
      { key: "inactive", label: "Inactive Only" },
    ];
    const typeOptions: { key: FilterType; label: string; color?: string }[] = [
      { key: "all", label: "All Types" },
      ...Object.entries(ALERT_TYPE_CONFIG).map(([k, v]) => ({ key: k as FilterType, label: v.label, color: v.color })),
    ];

    return (
      <Modal visible={showFilter} transparent animationType="slide">
        <Pressable style={styles.modalOverlay} onPress={() => setShowFilter(false)} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Sort & Filter</Text>

          <Text style={styles.modalSection}>Sort by</Text>
          <View style={styles.chipRow}>
            {sortOptions.map((o) => (
              <Pressable key={o.key} style={[styles.chip, sortBy === o.key && styles.chipActive]} onPress={() => setSortBy(o.key)}>
                <Text style={[styles.chipText, sortBy === o.key && styles.chipTextActive]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.modalSection}>Status</Text>
          <View style={styles.chipRow}>
            {statusOptions.map((o) => (
              <Pressable key={o.key} style={[styles.chip, filterStatus === o.key && styles.chipActive]} onPress={() => setFilterStatus(o.key)}>
                <Text style={[styles.chipText, filterStatus === o.key && styles.chipTextActive]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.modalSection}>Type</Text>
          <View style={styles.chipRow}>
            {typeOptions.map((o) => (
              <Pressable key={o.key} style={[styles.chip, filterType === o.key && styles.chipActive]} onPress={() => setFilterType(o.key)}>
                <Text style={[styles.chipText, filterType === o.key && styles.chipTextActive]}>{o.label}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.modalBtns}>
            <Pressable style={styles.resetBtn} onPress={() => { setSortBy("newest"); setFilterStatus("all"); setFilterType("all"); }}>
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
            <Pressable style={styles.applyBtn} onPress={() => setShowFilter(false)}>
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>Alerts</Text>
        <Pressable onPress={() => setShowFilter(true)} hitSlop={10} style={({ pressed }) => pressed && { opacity: 0.7 }}>
          <View style={{ position: "relative" }}>
            <Ionicons name="options-outline" size={24} color={Colors.textPrimary} />
            {hasActiveFilters && <View style={styles.filterDot} />}
          </View>
        </Pressable>
      </View>

      <Pressable
        onPress={() => router.push("/create-alert")}
        style={({ pressed }) => [styles.createBtn, pressed && { opacity: 0.85 }]}
      >
        <Ionicons name="add" size={22} color={Colors.white} />
        <Text style={styles.createBtnText}>Create New Alert</Text>
      </Pressable>
      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color={Colors.accent} /></View>
      ) : alerts.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="notifications-off-outline" size={56} color={Colors.borderLight} />
          <Text style={styles.emptyTitle}>No alerts yet</Text>
          <Text style={styles.emptySub}>Create alerts to get notified about important price changes.</Text>
        </View>
      ) : (
        <>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionLabel}>YOUR ALERTS</Text>
            <Text style={styles.activeCount}>{activeCount} Active</Text>
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} colors={[Colors.accent]} />}
            ListEmptyComponent={
              <View style={styles.noMatchWrap}>
                <Text style={styles.noMatchText}>No alerts match your filters.</Text>
              </View>
            }
            ListFooterComponent={
              filtered.length > 0 ? (
                <Text style={styles.footerText}>{"You've reached the end of your alerts."}</Text>
              ) : null
            }
          />
        </>
      )}

      {renderFilterModal()}
    </SafeAreaView>
  );
}

const DELETE_BTN_WIDTH = 80;

function SwipeableAlertCard({
  item,
  styles,
  onPress,
  onToggle,
  onDelete,
}: {
  item: AlertModel;
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
  onToggle: (id: string, val: boolean) => void;
  onDelete: () => void;
}) {
  const swipeRef = useRef<Swipeable>(null);
  const config = ALERT_TYPE_CONFIG[item.type];

  function renderRightActions(
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) {
    const scale = dragX.interpolate({
      inputRange: [-DELETE_BTN_WIDTH, 0],
      outputRange: [1, 0.5],
      extrapolate: "clamp",
    });
    return (
      <Pressable
        style={styles.deleteBtn}
        onPress={() => {
          swipeRef.current?.close();
          onDelete();
        }}
      >
        <Animated.View style={{ alignItems: "center", gap: 4, transform: [{ scale }] }}>
          <Ionicons name="trash-outline" size={22} color={Colors.white} />
          <Text style={styles.deleteBtnText}>Delete</Text>
        </Animated.View>
      </Pressable>
    );
  }

  return (
    <View style={styles.swipeRow}>
      <Swipeable
        ref={swipeRef}
        renderRightActions={renderRightActions}
        rightThreshold={DELETE_BTN_WIDTH / 2}
        friction={2}
        overshootFriction={8}
        onSwipeableOpen={(direction) => {
          if (direction === "right") {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
        }}
      >
        <Pressable
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.95 }]}
          onPress={onPress}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            Alert.alert("Delete Alert", `Remove ${item.symbol} ${item.description}?`, [
              { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: onDelete },
            ]);
          }}
        >
          <View style={styles.cardLeft}>
            <View style={styles.iconWrap}>
              <Text style={styles.iconText}>{item.symbol.charAt(0)}</Text>
            </View>
            <View style={styles.cardInfo}>
              <View style={styles.symbolRow}>
                <Text style={styles.symbol}>{item.symbol}</Text>
                <View style={[styles.typeBadge, { backgroundColor: config.bg }]}>
                  <Text style={[styles.typeText, { color: config.color }]}>{config.label}</Text>
                </View>
              </View>
              <Text style={styles.description}>{item.description} · {timeAgo(item.createdAt)}</Text>
            </View>
          </View>
          <Switch
            value={item.isActive}
            onValueChange={(val) => onToggle(item.id, val)}
            trackColor={{ false: Colors.divider, true: Colors.successLight }}
            thumbColor={item.isActive ? Colors.success : Colors.textTertiary}
          />
        </Pressable>
      </Swipeable>
    </View>
  );
}

const createStyles = () => StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16,
  },
  title: { fontSize: 30, color: Colors.textPrimary, fontFamily: Fonts.bold },
  filterDot: {
    position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent,
  },

  createBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginHorizontal: 20, height: 52, borderRadius: 16, backgroundColor: Colors.primary,
    shadowColor: Colors.shadow, shadowOpacity: 0.12, shadowRadius: 14, shadowOffset: { width: 0, height: 8 },
    elevation: 4, marginBottom: 20,
  },
  createBtnText: { color: Colors.white, fontSize: 16, fontFamily: Fonts.bold },
  sectionRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, marginBottom: 14,
  },
  sectionLabel: { fontSize: 12, color: Colors.textTertiary, fontFamily: Fonts.semiBold, letterSpacing: 1 },
  activeCount: { fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.medium },

  listContent: { paddingHorizontal: 20, paddingBottom: 30 },

  card: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: Colors.card, borderRadius: 18, padding: 16,
  },
  cardLeft: { flexDirection: "row", alignItems: "center", flex: 1, marginRight: 12 },
  iconWrap: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.iconBackground,
    alignItems: "center", justifyContent: "center", marginRight: 12,
  },
  iconText: { fontSize: 17, color: Colors.textPrimary, fontFamily: Fonts.bold },
  cardInfo: { flex: 1 },
  symbolRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  symbol: { fontSize: 16, color: Colors.textPrimary, fontFamily: Fonts.bold },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  typeText: { fontSize: 10, fontFamily: Fonts.bold, letterSpacing: 0.5 },
  description: { marginTop: 4, fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.medium },
  swipeRow: {
    marginBottom: 10,
    borderRadius: 18,
    overflow: "hidden",
  },
  deleteBtn: {
    width: DELETE_BTN_WIDTH,
    backgroundColor: Colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtnText: { color: Colors.white, fontSize: 12, fontFamily: Fonts.bold },

  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center" },

  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 8 },
  emptyTitle: { fontSize: 20, color: Colors.textPrimary, fontFamily: Fonts.bold, marginTop: 8 },
  emptySub: { fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.medium, textAlign: "center", lineHeight: 20 },

  noMatchWrap: { alignItems: "center", paddingVertical: 40 },
  noMatchText: { fontSize: 14, color: Colors.textSecondary, fontFamily: Fonts.medium },

  footerText: { textAlign: "center", color: Colors.textTertiary, fontSize: 13, fontFamily: Fonts.medium, marginTop: 10, paddingBottom: 10 },

  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
  modalSheet: {
    backgroundColor: Colors.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 24, paddingTop: 12, paddingBottom: 40,
    position: "absolute", bottom: 0, left: 0, right: 0,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: Colors.divider, alignSelf: "center", marginBottom: 18,
  },
  modalTitle: { fontSize: 22, color: Colors.textPrimary, fontFamily: Fonts.bold, marginBottom: 20 },
  modalSection: { fontSize: 13, color: Colors.textTertiary, fontFamily: Fonts.semiBold, letterSpacing: 0.5, marginBottom: 10, marginTop: 6 },

  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  chip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12,
    backgroundColor: Colors.iconBackground, borderWidth: 1.5, borderColor: "transparent",
  },
  chipActive: { backgroundColor: "rgba(44,102,255,0.08)", borderColor: Colors.accent },
  chipText: { fontSize: 13, color: Colors.textSecondary, fontFamily: Fonts.medium },
  chipTextActive: { color: Colors.accent, fontFamily: Fonts.bold },

  modalBtns: { flexDirection: "row", gap: 12, marginTop: 24 },
  resetBtn: {
    height: 50, paddingHorizontal: 24, borderRadius: 14, backgroundColor: Colors.iconBackground,
    alignItems: "center", justifyContent: "center",
  },
  resetText: { fontSize: 15, color: Colors.textSecondary, fontFamily: Fonts.semiBold },
  applyBtn: {
    flex: 1, height: 50, borderRadius: 14, backgroundColor: Colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  applyText: { color: Colors.white, fontSize: 15, fontFamily: Fonts.bold },
});
