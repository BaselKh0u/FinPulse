import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { initializeSession, getSessionUserId } from "@/services/session";

export default function Index() {
  return <Redirect href="/auth/login" />;
} 
