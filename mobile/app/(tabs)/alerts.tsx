import { View, Text, StyleSheet } from "react-native";

export default function AlertsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Alerts</Text>
      <Text style={styles.sub}>Coming soon…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F6F7FB", padding: 16, paddingTop: 60 },
  title: { fontSize: 28, fontWeight: "900", color: "#0B1220" },
  sub: { marginTop: 8, color: "#6B758A", fontSize: 16, fontWeight: "600" },
});