// sites.js — which websites FilthBlurrr protects.
//
// Protection is opt-in per website. A website is stored as its main domain
// ("reddit.com"), which also covers "old.reddit.com", "www.reddit.com", etc.

export const MAJOR_SITES = [
  { id: "google", name: "Google", hosts: ["google.com"] },
  { id: "youtube", name: "YouTube", hosts: ["youtube.com"] },
  { id: "instagram", name: "Instagram", hosts: ["instagram.com"] },
  { id: "facebook", name: "Facebook", hosts: ["facebook.com"] },
  { id: "x", name: "X (Twitter)", hosts: ["x.com", "twitter.com"] },
  { id: "tiktok", name: "TikTok", hosts: ["tiktok.com"] },
  { id: "reddit", name: "Reddit", hosts: ["reddit.com"] },
  { id: "pinterest", name: "Pinterest", hosts: ["pinterest.com"] },
  { id: "snapchat", name: "Snapchat", hosts: ["snapchat.com"] },
  { id: "threads", name: "Threads", hosts: ["threads.net", "threads.com"] },
  { id: "bluesky", name: "Bluesky", hosts: ["bsky.app"] },
  { id: "tumblr", name: "Tumblr", hosts: ["tumblr.com"] },
  { id: "telegram", name: "Telegram Web", hosts: ["telegram.org"] },
  { id: "whatsapp", name: "WhatsApp Web", hosts: ["whatsapp.com"] },
  { id: "discord", name: "Discord", hosts: ["discord.com"] },
  { id: "twitch", name: "Twitch", hosts: ["twitch.tv"] },
  { id: "kick", name: "Kick", hosts: ["kick.com"] },
  { id: "imgur", name: "Imgur", hosts: ["imgur.com"] },
  { id: "giphy", name: "GIPHY", hosts: ["giphy.com"] },
  { id: "tenor", name: "Tenor", hosts: ["tenor.com"] },
  { id: "bing", name: "Bing", hosts: ["bing.com"] },
  { id: "duckduckgo", name: "DuckDuckGo", hosts: ["duckduckgo.com"] },
  { id: "yahoo", name: "Yahoo", hosts: ["yahoo.com"] },
  { id: "yandex", name: "Yandex", hosts: ["yandex.com", "yandex.ru"] },
  { id: "vimeo", name: "Vimeo", hosts: ["vimeo.com"] },
  { id: "dailymotion", name: "Dailymotion", hosts: ["dailymotion.com"] },
  { id: "linkedin", name: "LinkedIn", hosts: ["linkedin.com"] },
  { id: "quora", name: "Quora", hosts: ["quora.com"] },
  { id: "flickr", name: "Flickr", hosts: ["flickr.com"] },
  { id: "vk", name: "VK", hosts: ["vk.com"] },
];

export const ALL_MAJOR_HOSTS = MAJOR_SITES.flatMap((s) => s.hosts);

const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "edu", "ac"]);

/** "https://www.images.google.co.uk/x" -> "google.co.uk". Returns "" if not a web page. */
export function siteKey(input) {
  let host = input;
  if (/^[a-z][a-z0-9+.-]*:/i.test(input)) {
    try {
      const u = new URL(input);
      if (u.protocol !== "http:" && u.protocol !== "https:") return "";
      host = u.hostname;
    } catch {
      return "";
    }
  }
  host = host.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return "";
  if (/^[\d.]+$/.test(host) || host.includes(":") || !host.includes(".")) return host; // IP or localhost
  const labels = host.split(".");
  const tld = labels[labels.length - 1];
  const sld = labels[labels.length - 2];
  const keep = tld.length === 2 && SECOND_LEVEL.has(sld) ? 3 : 2;
  return labels.slice(-keep).join(".");
}

/** The stored entry that covers `hostname`, or null. */
export function entryFor(sites, hostname) {
  const host = hostname.toLowerCase();
  return sites.find((s) => host === s || host.endsWith("." + s)) ?? null;
}

export function isProtected(sites, hostname) {
  return !!hostname && entryFor(sites, hostname) !== null;
}

/** Turns what someone typed ("https://www.Example.com/page") into a stored entry, or "". */
export function parseSiteInput(text) {
  const raw = text.trim();
  if (!raw) return "";
  const key = siteKey(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "https://" + raw.replace(/\/.*$/, ""));
  return /^[a-z0-9.-]+$/.test(key) && key.includes(".") ? key : "";
}
