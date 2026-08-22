"use client";

import { useEffect, useState } from "react";
import { parseDemoTier, type DemoTier } from "./demoTier";

export function useDemoTier(): DemoTier {
  const [tier, setTier] = useState<DemoTier>("premium");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTier(parseDemoTier(new URLSearchParams(window.location.search).get("tier")));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  return tier;
}
