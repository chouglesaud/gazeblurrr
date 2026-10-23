import { useEffect, useRef, useState, type ReactNode } from "react";
import { ISSUES_URL, REPO_URL } from "../../src/config.js";
import { LEVELS, MODES } from "../../src/policy.js";
import { REVEAL_CHOICES, effective, revealLabel } from "../../src/settings.js";
import { ALL_MAJOR_HOSTS, MAJOR_SITES, entryFor, parseSiteInput } from "../../src/sites.js";
import { Button, Checkbox, Logo, RadioGroup, RadioItem, Select, Switch } from "./components/ui";
import { useSettings, type Settings } from "./useSettings";

type Site = { id: string; name: string; hosts: string[] };
const sites = MAJOR_SITES as Site[];
const modes = Object.entries(MODES) as [string, { title: string; blurb: string }][];
const levels = Object.entries(LEVELS) as [string, { title: string; blurb: string }][];
const revealOptions = REVEAL_CHOICES.map((s: number) => ({ value: String(s), label: revealLabel(s) }));
const known = new Set<string>(ALL_MAJOR_HOSTS);

function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-t border-line pb-6 pt-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Correction({ label, count, onClear }: { label: string; count: number; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5">
      <span className={count ? "" : "text-muted"}>{count === 0 ? `None ${label}` : `${count} ${count === 1 ? "item" : "items"} ${label}`}</span>
      {count > 0 && (
        <Button variant="danger" onClick={onClear}>
          Forget
        </Button>
      )}
    </div>
  );
}

export default function OptionsView() {
  const { settings: s, update: rawUpdate } = useSettings();
  const [welcome, setWelcome] = useState(location.hash === "#welcome");
  const [toast, setToast] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const timer = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);
  if (!s) return null;

  const update = async (patch: Partial<Settings>) => {
    await rawUpdate(patch);
    setToast(true);
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(false), 1400);
  };

  const clearList = async (list: "safe" | "blocked", question: string) => {
    if (!confirm(question)) return;
    await update({ [list]: [] });
    chrome.runtime.sendMessage({ op: "refresh-pages" });
  };

  const covered = (host: string) => entryFor(s.sites, host) !== null;
  const groupOn = (site: Site) => site.hosts.every(covered);
  const toggleSite = (site: Site, on: boolean) => {
    const rest = s.sites.filter((h) => !site.hosts.includes(h));
    update({ sites: on ? [...rest, ...site.hosts] : rest });
  };
  const extra = s.sites.filter((h) => !known.has(h));

  const addSite = (e: React.FormEvent) => {
    e.preventDefault();
    const site = parseSiteInput(input);
    if (!site) return setError("That doesn’t look like a website. Try something like example.com");
    setError("");
    setInput("");
    if (!covered(site)) update({ sites: [...s.sites, site] });
  };

  return (
    <div className="mx-auto max-w-[640px] px-5 pb-16 pt-8">
      <header className="mb-4 flex items-center gap-2.5">
        <Logo />
        <h1 className="text-lg font-semibold">FilthBlurrr</h1>
      </header>

      <blockquote className="mb-6 border-l-[3px] border-accent py-0.5 pl-3.5">
        <p className="text-[13.5px] leading-snug">
          “Tell the believing men to lower their gaze and guard their chastity. That is purer for them.”
        </p>
        <footer className="mt-1 text-[12.5px] text-muted">Qur’an 24:30</footer>
      </blockquote>

      {welcome && (
        <div className="mb-6 flex items-center justify-between gap-3 border-l-[3px] border-accent py-1 pl-3.5">
          <p>FilthBlurrr is on for the websites below. Choose Man or Woman first.</p>
          <Button
            onClick={() => {
              history.replaceState(null, "", location.pathname);
              setWelcome(false);
            }}
          >
            OK
          </Button>
        </div>
      )}

      <Section title="Mode">
        <RadioGroup value={s.mode} onValueChange={(mode) => update({ mode })} className="grid gap-0.5">
          {modes.map(([id, m]) => (
            <label key={id} className="flex cursor-pointer items-center gap-2.5 py-1.5">
              <RadioItem value={id} className="mt-0" />
              <span>
                {m.title} <span className="text-muted">· {m.blurb}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </Section>

      <Section
        title="Websites"
        aside={
          <div className="flex items-baseline gap-3 text-[13px] text-muted">
            <span>
              {sites.filter(groupOn).length} of {sites.length} on
            </span>
            <Button variant="link" onClick={() => update({ sites: [...new Set([...s.sites, ...ALL_MAJOR_HOSTS])] })}>
              Select all
            </Button>
            <Button variant="link" onClick={() => update({ sites: s.sites.filter((h) => !known.has(h)) })}>
              Clear
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-x-4 gap-y-0.5">
          {sites.map((site) => (
            <label key={site.id} className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md px-1 py-[5px] hover:bg-hover">
              <Checkbox checked={groupOn(site)} onCheckedChange={(c) => toggleSite(site, c === true)} />
              <span className="truncate">{site.name}</span>
            </label>
          ))}
        </div>

        {extra.length > 0 && (
          <div className="mt-3.5 flex flex-wrap gap-1.5">
            {extra.map((host) => (
              <span key={host} className="inline-flex items-center gap-1 rounded-md border border-line py-0.5 pl-2.5 pr-1">
                {host}
                <button
                  aria-label={`Stop protecting ${host}`}
                  className="px-1.5 text-[15px] leading-tight text-muted hover:text-fg"
                  onClick={() => update({ sites: s.sites.filter((x) => x !== host) })}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <form onSubmit={addSite} className="mt-3.5 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add a website, e.g. example.com"
            aria-label="Website to add"
            autoComplete="off"
            className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2.5 focus-visible:outline-2 focus-visible:outline-accent"
          />
          <Button type="submit">Add</Button>
        </form>
        <p role="alert" className="mt-1 min-h-[18px] text-[13px] text-danger">
          {error}
        </p>
      </Section>

      <Section title="Default for every website">
        <p className="mb-2 text-[12.5px] text-muted">Each website can override these from the toolbar popup.</p>
        <RadioGroup value={s.level} onValueChange={(level) => update({ level })} className="grid gap-0.5">
          {levels.map(([id, l]) => (
            <label key={id} className="flex cursor-pointer items-start gap-2.5 py-1.5">
              <RadioItem value={id} />
              <span>
                {l.title} <span className="text-muted">· {l.blurb}</span>
              </span>
            </label>
          ))}
        </RadioGroup>
        <div className="mt-2 flex items-center justify-between gap-4 py-1.5">
          <span>Allow Show</span>
          <Switch checked={s.allowReveal} onCheckedChange={(allowReveal) => update({ allowReveal })} aria-label="Allow Show" />
        </div>
        {s.allowReveal && (
          <div className="flex items-center justify-between gap-4 py-1.5">
            <span>Cover after</span>
            <Select
              label="Cover after"
              value={String(s.revealSeconds)}
              onValueChange={(v) => update({ revealSeconds: Number(v) })}
              options={revealOptions}
              className="w-44"
            />
          </div>
        )}
      </Section>

      {Object.keys(s.siteConfig).length > 0 && (
        <Section title="Custom websites">
          {Object.keys(s.siteConfig).map((host) => {
            const e = effective(s, host);
            return (
              <div key={host} className="flex items-center justify-between gap-4 py-1.5">
                <span>
                  <b className="font-medium">{host}</b>{" "}
                  <span className="text-[12.5px] text-muted">
                    {levels.find(([id]) => id === e.level)?.[1].title} ·{" "}
                    {e.allowReveal ? `cover after ${revealLabel(e.revealSeconds)}` : "Show off"}
                  </span>
                </span>
                <Button
                  onClick={() => {
                    const { [host]: _gone, ...rest } = s.siteConfig;
                    update({ siteConfig: rest });
                  }}
                >
                  Reset
                </Button>
              </div>
            );
          })}
        </Section>
      )}

      <Section title="Corrections">
        <Correction
          label="marked safe"
          count={s.safe.length}
          onClear={() => clearList("safe", "Blur the ones marked safe again if they look inappropriate?")}
        />
        <Correction
          label="blurred by you"
          count={s.blocked.length}
          onClear={() => clearList("blocked", "Stop blurring the ones you blurred yourself?")}
        />
      </Section>

      <footer className="border-t border-line pt-4 text-[12.5px] text-muted">
        Nothing leaves this computer. <a className="text-accent underline" href={REPO_URL} target="_blank" rel="noopener">Source</a> ·{" "}
        <a className="text-accent underline" href={ISSUES_URL} target="_blank" rel="noopener">Report a problem</a> · v
        {chrome.runtime.getManifest().version}
      </footer>

      <div
        role="status"
        className={`pointer-events-none fixed bottom-5 right-5 rounded-md bg-fg px-3 py-1.5 text-[13px] text-bg transition-opacity ${toast ? "opacity-100" : "opacity-0"}`}
      >
        Saved
      </div>
    </div>
  );
}
