import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { initializeSession, getSessionUserId } from "@/services/session";

export default function Index() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      await initializeSession();
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return null;
  }

  return <Redirect href={getSessionUserId() ? "/(tabs)" : "/auth/login"} />;
}