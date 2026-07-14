// Runtime-editable configuration. Persisted in localStorage.
// Processor and scheduler read from here so rules aren't hardcoded.

export interface AppSettings {
  siteAllowed: string;
  refrig1: string[];
  refrig2: string[];
  refrig3: string[];
  hidraulicaKeywords: string[];
  workingHours: {
    morningStart: string; // HH:mm
    morningEnd: string;
    afternoonStart: string;
    afternoonEnd: string;
  };
  defaultTaskMinutes: number;
  workdays: number[]; // 0=Sun..6=Sat
}

export const DEFAULT_SETTINGS: AppSettings = {
  siteAllowed: "DEMARCHI",
  refrig1: ["A160", "A170", "ADC", "Ambulatório", "B203"],
  refrig2: [
    "A220","B115","B290","C110","C120","C340","C380","C45","C46","C49","C65","C70","D240","D246",
  ],
  refrig3: [
    "D270","D295","D345","D55","E105","E125","E130","E171","E200","E310","E35","E70","E80",
    "F30","Fundação ECO+","Z210","Z310","Z500",
  ],
  hidraulicaKeywords: [
    "Caixas Pluviais","Fluentes","Canaletas","Tubulações","Limpeza de Calhas",
    "Grelhas","Ralos","Bocas de Lobo",
  ],
  workingHours: {
    morningStart: "08:00",
    morningEnd: "12:00",
    afternoonStart: "13:00",
    afternoonEnd: "17:00",
  },
  defaultTaskMinutes: 60,
  workdays: [1, 2, 3, 4, 5],
};

const KEY = "app-settings:v1";

let cache: AppSettings | null = null;
const listeners = new Set<(s: AppSettings) => void>();

export function getSettings(): AppSettings {
  if (cache) return cache;
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw
      ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
      : DEFAULT_SETTINGS;
  } catch {
    cache = DEFAULT_SETTINGS;
  }
  return cache!;
}

export function saveSettings(s: AppSettings) {
  cache = s;
  localStorage.setItem(KEY, JSON.stringify(s));
  listeners.forEach((l) => l(s));
}

export function subscribeSettings(fn: (s: AppSettings) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// React hook
import { useEffect, useState } from "react";
export function useSettings(): [AppSettings, (s: AppSettings) => void] {
  const [s, setS] = useState<AppSettings>(() => getSettings());
  useEffect(() => subscribeSettings(setS) as unknown as () => void, []);
  return [s, saveSettings];
}
