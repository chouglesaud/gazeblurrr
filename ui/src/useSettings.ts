import { useCallback, useEffect, useState } from "react";
import { loadSettings, saveSettings } from "../../src/settings.js";

export type Settings = {
  sites: string[];
  level: string;
  mode: string;
  allowReveal: boolean;
  revealSeconds: number;
  siteConfig: Record<string, { level?: string; allowReveal?: boolean; revealSeconds?: number }>;
  safe: string[];
  blocked: string[];
  totalBlurred: number;
  welcomed: boolean;
};

/** Settings from chrome.storage.local, kept in step with changes made anywhere (popup, settings page, other windows). */
export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let alive = true;
    const refresh = () => loadSettings().then((s: Settings) => alive && setSettings(s));
    refresh();
    const onChange = (_: unknown, area: string) => area === "local" && refresh();
    chrome.storage.onChanged.addListener(onChange);
    return () => {
      alive = false;
      chrome.storage.onChanged.removeListener(onChange);
    };
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s)); // instant; storage confirms right after
    await saveSettings(patch);
  }, []);

  return { settings, update };
}
