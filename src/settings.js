// settings.js — defaults plus thin helpers over chrome.storage.local.
// chrome.storage.sync is deliberately not used: this is a record of what a
// person wants to protect themselves from, and it has no business on a server.

import { DEFAULT_LEVEL, DEFAULT_MODE } from "./policy.js";
import { ALL_MAJOR_HOSTS } from "./sites.js";

export const SAFE_LIMIT = 1000;

export const DEFAULTS = {
  sites: [], // websites where protection is on
  level: DEFAULT_LEVEL,
  mode: DEFAULT_MODE, // "man" blurs women, "woman" blurs men. One setting for every website.
  allowReveal: true, // may a blurred picture be uncovered for a moment?
  revealSeconds: 5, // 0 = stays uncovered until the page is reloaded
  siteConfig: {}, // per-website overrides: { "reddit.com": { level, allowReveal, revealSeconds } }
  safe: [], // pictures/videos the user said were blurred by mistake
  blocked: [], // pictures/videos the user chose to blur by hand
  totalBlurred: 0,
  welcomed: false,
};

/**
 * The settings that apply on one website: its own choices where it has any,
 * the defaults everywhere else. `entry` is the stored site ("reddit.com").
 */
export function effective(s, entry) {
  const own = (entry && s.siteConfig?.[entry]) || {};
  return {
    level: own.level ?? s.level,
    allowReveal: own.allowReveal ?? s.allowReveal,
    revealSeconds: own.revealSeconds ?? s.revealSeconds,
  };
}

export const REVEAL_CHOICES = [3, 5, 10, 15, 30, 60, 0];

export function revealLabel(seconds) {
  return seconds === 0 ? "Until I reload the page" : `${seconds} seconds`;
}

export async function loadSettings() {
  const stored = await chrome.storage.local.get(DEFAULTS);
  const settings = { ...DEFAULTS, ...stored };
  if (settings.mode !== "man" && settings.mode !== "woman") settings.mode = DEFAULT_MODE;
  return settings;
}

export async function saveSettings(patch) {
  await chrome.storage.local.set(patch);
}

export async function setFirstRunDefaults() {
  const { welcomed } = await chrome.storage.local.get({ welcomed: false });
  if (welcomed) return false;
  await chrome.storage.local.set({ sites: [...ALL_MAJOR_HOSTS], welcomed: true });
  return true;
}
