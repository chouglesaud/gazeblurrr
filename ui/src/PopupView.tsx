import { useEffect, useState } from "react";
import { LEVELS } from "../../src/policy.js";
import { REVEAL_CHOICES, effective, revealLabel } from "../../src/settings.js";
import { entryFor, siteKey } from "../../src/sites.js";
import { Logo, Select, Switch } from "./components/ui";
import { useSettings } from "./useSettings";

const levels = LEVELS as Record<string, { title: string }>;
const levelOptions = Object.entries(levels).map(([value, l]) => ({ value, label: l.title }));
const revealOptions = REVEAL_CHOICES.map((s: number) => ({ value: String(s), label: revealLabel(s) }));

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      {children}
    </div>
  );
}

export default function PopupView() {
  const { settings: s, update } = useSettings();
  const [site, setSite] = useState<string | null>(null); // null = still looking, "" = not a web page

  useEffect(() => {
    chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => setSite(tab?.url ? siteKey(tab.url) : ""));
  }, []);

  if (!s || site === null) return <div className="h-40 w-[300px]" />;

  const entry = site ? entryFor(s.sites, site) : null;
  const key = entry ?? site; // saved against the protected site, or this site once it is switched on
  const mine = effective(s, key);
  const own = s.siteConfig[key] ?? {};

  const toggle = (checked: boolean) =>
    update({ sites: checked ? [...new Set([...s.sites, site])] : s.sites.filter((x) => x !== entry) });
  // These three apply to this website only.
  const setHere = (patch: Partial<typeof own>) => update({ siteConfig: { ...s.siteConfig, [key]: { ...own, ...patch } } });
  const reset = () => {
    const { [key]: _gone, ...rest } = s.siteConfig;
    update({ siteConfig: rest });
  };

  return (
    <div className="w-[280px] px-4 pb-3 pt-3.5">
      <header className="mb-3 flex items-center gap-2">
        <Logo />
        <b className="font-semibold">GazeBlurrr</b>
      </header>

      <div className="flex items-center justify-between gap-3">
        <div className="truncate text-[17px] font-semibold">{site || "This page"}</div>
        <Switch checked={!!entry} disabled={!site} onCheckedChange={toggle} aria-label="Protect this website" />
      </div>

      {site && (
        <div className="mt-3 grid gap-2.5 border-t border-line pt-3">
          <Row label="Strength">
            <Select label="Strength" value={mine.level} onValueChange={(level) => setHere({ level })} options={levelOptions} className="w-40" />
          </Row>
          <Row label="Allow Show">
            <Switch checked={mine.allowReveal} onCheckedChange={(allowReveal) => setHere({ allowReveal })} aria-label="Allow Show" />
          </Row>
          {mine.allowReveal && (
            <Row label="Cover after">
              <Select
                label="Cover after"
                value={String(mine.revealSeconds)}
                onValueChange={(v) => setHere({ revealSeconds: Number(v) })}
                options={revealOptions}
                className="w-40"
              />
            </Row>
          )}
          {Object.keys(own).length > 0 && (
            <button className="justify-self-start text-[12.5px] text-accent underline" onClick={reset}>
              Reset to default
            </button>
          )}
        </div>
      )}

      <footer className="mt-3 flex items-center justify-between border-t border-line pt-2.5 text-[12.5px]">
        <span className="text-muted">{s.totalBlurred > 0 ? `${s.totalBlurred.toLocaleString()} blurred` : ""}</span>
        <button
          className="text-accent underline"
          onClick={() => {
            chrome.runtime.openOptionsPage();
            window.close();
          }}
        >
          Settings
        </button>
      </footer>
    </div>
  );
}
