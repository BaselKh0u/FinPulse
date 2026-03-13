import { View, Text, StyleSheet, Pressable } from "react-native";
import { useRouter } from "expo-router";

export default function AddStockScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Pressable onPress={() => router.back()} style={styles.back}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <Text style={styles.title}>Add New Stock</Text>
      <Text style={styles.sub}>Coming soon…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0b1220", padding: 16, paddingTop: 60 },
  title: { color: "white", fontSize: 28, fontWeight: "800" },
  sub: { color: "#9AA3B2", marginTop: 10, fontSize: 16 },
  back: { marginBottom: 14 },
  backText: { color: "#2C66FF", fontSize: 16, fontWeight: "700" },
});