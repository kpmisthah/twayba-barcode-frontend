"use client";

import { useEffect, useState } from "react";
import { api } from "./api";
import type { Settings } from "./types";

let cache: Promise<Settings> | null = null;

/** Settings are read often and change rarely, so they are fetched once per page load. */
export function loadSettings(force = false): Promise<Settings> {
  if (!cache || force) {
    cache = api<Settings>("/settings").catch((e) => {
      cache = null;
      throw e;
    });
  }
  return cache;
}

export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    loadSettings().then(setSettings, () => setSettings(null));
  }, []);
  return settings;
}

export function formatMoney(value: string | number | null | undefined, currency = "EUR"): string {
  if (value === null || value === undefined || value === "") return "—";
  return new Intl.NumberFormat("en-MT", { style: "currency", currency }).format(Number(value));
}
