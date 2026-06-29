import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPrivateIpAddress } from "@/lib/web-scout-utils";
export { mapWithConcurrency } from "@/lib/web-scout-utils";

// ---------------------------------------------------------------------------
// Web Scout — crawls a business website to extract public contact data,
// booking signals, social channels, competitor chatbots, and location info.
//
// Design principles:
//   - Server-only (never exposed to the browser).
//   - Uses only fetch() + regex — zero runtime dependencies.
//   - Timeout and size caps on every request.
//   - Respectful: sequential sub-page probes, small delays.
//   - All extracted data comes from public HTML — no scraping behind auth walls.
// ---------------------------------------------------------------------------

const EMAIL_RE_GLOBAL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const INVALID_EMAIL_PATTERNS = [".png", ".jpg", ".jpeg", ".webp", ".svg", "@2x", "@3x", ".gif", ".avif"];
const PHONE_RE_IT = /(?:\+?\d{1,3}[-\s]?)?\(?\d{2,4}\)?[-\s]?\d{2,4}[-\s]?\d{3,5}/g;

const BOOKING_TEXT_PATTERNS = [
  "prenota", "prenotazione", "booking", "reserva", "reservation", "book now",
  "check-in", "check-out", "cerca disponibilita", "cerca disponibilità",
];
const BOOKING_PATH_PATTERNS = [
  "/booking", "/book", "/reservation", "/reservations", "/prenota", "/prenotazioni",
  "/rooms", "/camere", "/availability",
];
const BOOKING_PROVIDER_PATTERNS = [
  "amenitiz", "booking engine", "simplebooking", "vertical booking", "blastness", "ericsoft",
  "cubilis", "roomcloud", "bedzzle", "hotelcinquestelle", "zak", "octorate", "bookassist",
  "synxis", "d-edge", "hotelnerds", "mirai",
];

const WHATSAPP_PATTERNS = ["wa.me", "api.whatsapp.com", "whatsapp://", "whatsapp"];
const CHATBOT_PROVIDERS: Array<{ name: string; re: RegExp }> = [
  { name: "intercom", re: /intercom/ },
  { name: "drift", re: /drift/ },
  { name: "tawk", re: /tawk/ },
  { name: "crisp", re: /crisp/ },
  { name: "zendesk", re: /zendesk chat/ },
  { name: "hubspot", re: /hubspot.*chat|chat.*hubspot/ },
  { name: "livechat", re: /livechat/ },
  { name: "messenger", re: /facebook.*messenger|messenger/ },
];

const SOCIAL_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "facebook", re: /facebook\.com|fb\.com/ },
  { name: "instagram", re: /instagram\.com/ },
  { name: "linkedin", re: /linkedin\.com/ },
  { name: "tiktok", re: /tiktok\.com|@tiktok/ },
  { name: "youtube", re: /youtube\.com|youtu\.be/ },
  { name: "twitter", re: /twitter\.com|x\.com/ },
  { name: "tripadvisor", re: /tripadvisor\.(it|com)/ },
];

// ── Types ──────────────────────────────────────────────────────────────────

export type EmailQuality = "high" | "medium" | "low" | "none";
export type PhoneType = "mobile" | "landline";
export type BookingVisibility = "above_fold" | "below_fold" | "hidden" | "subflow" | "none";
export type EvidenceLevel = "high" | "medium" | "low";

export type ScoutedEmail = { address: string; quality: EmailQuality };
export type ScoutedPhone = { number: string; type: PhoneType };
export type ScoutedSocial = { platform: string; url: string };
export type ScoutedLocation = { address: string; city: string | null };

export type WebScoutResult = {
  status: "ok" | "no_website" | "fetch_error";
  websiteUrl: string;
  businessName: string | null;
  emails: ScoutedEmail[];
  phones: ScoutedPhone[];
  hasBooking: boolean;
  bookingProvider: string;
  bookingVisibility: BookingVisibility;
  hasWhatsapp: boolean;
  whatsappLink: string | null;
  hasChatbot: boolean;
  chatbotProvider: string;
  hasContactForm: boolean;
  socialChannels: ScoutedSocial[];
  locations: ScoutedLocation[];
  checkedUrls: string[];
  evidenceLevel: EvidenceLevel;
  error?: string;
};

// ── Fetch helpers ──────────────────────────────────────────────────────────
function toAbsoluteUrl(base: string, link: string): string {
  try { return new URL(link, base).toString(); } catch { return ""; }
}

function extractHrefLinks(html: string): string[] {
  const links: string[] = [];
  const hrefRe = /href\s*=\s*["']([^"'#\s>]+)["']/gi;
  let m: RegExpExecArray | null = null;
  while ((m = hrefRe.exec(html)) !== null) {
    if (m[1]) links.push(m[1].trim());
  }
  return links;
}

const MAX_RESPONSE_BYTES = 300_000;
const MAX_REDIRECTS = 3;

async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  const parsed = new URL(rawUrl);
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("UNSAFE_URL");
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("UNSAFE_URL");
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateIpAddress(entry.address))) {
    throw new Error("UNSAFE_URL");
  }
  return parsed;
}

async function readLimitedText(response: Response): Promise<string> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("RESPONSE_TOO_LARGE");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let output = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;
    if (bytesRead > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("RESPONSE_TOO_LARGE");
    }
    output += decoder.decode(value, { stream: true });
  }
  return output + decoder.decode();
}

async function fetchPage(url: string, timeoutMs = 8_000): Promise<{ html: string; finalUrl: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let current = (await assertPublicHttpUrl(url)).toString();
    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const res = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "StudioRadar/1.0 (B2B lead research)" },
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get("location");
        if (!location || redirects === MAX_REDIRECTS) return null;
        current = (await assertPublicHttpUrl(new URL(location, current).toString())).toString();
        continue;
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "text/html").toLowerCase().includes("html")) return null;
      return { html: await readLimitedText(res), finalUrl: current };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Email extraction ───────────────────────────────────────────────────────

function extractEmails(html: string, links: string[]): { valid: string[]; quality: EmailQuality } {
  const allText = `${html}\n${links.join("\n")}`;
  const raw = [...new Set(allText.match(EMAIL_RE_GLOBAL) ?? [])];
  const valid = raw.filter((e) => {
    const lower = e.toLowerCase();
    return !INVALID_EMAIL_PATTERNS.some((p) => lower.includes(p))
      && lower.length >= 6
      && lower.length <= 120
      && !lower.startsWith("@")
      && !lower.endsWith("@")
      && lower.includes(".")
      && !lower.endsWith(".");
  });

  const contactZone = html.slice(0, Math.min(html.length, 50000)).toLowerCase();
  const isInContactZone = /contattaci|contatti|contact|dove-siamo|scrivici/i.test(contactZone);

  let quality: EmailQuality = "none";
  if (valid.length > 0 && isInContactZone) quality = "high";
  else if (valid.length > 0) quality = "medium";
  return { valid, quality };
}

// ── Phone extraction ───────────────────────────────────────────────────────

function isMobileIT(phone: string): boolean {
  let d = phone.replace(/\D/g, "");
  if (d.startsWith("0039")) d = d.slice(4);
  while (d.startsWith("39") && d.length > 9) d = d.slice(2);
  if (d.startsWith("0")) return false;
  return d.startsWith("3") && d.length >= 9 && d.length <= 11;
}

function extractPhones(html: string): ScoutedPhone[] {
  const text = html.slice(0, 100_000);
  const raw = [...new Set(text.match(PHONE_RE_IT) ?? [])];
  return raw
    .map((n) => n.replace(/\s+/g, " ").trim())
    .filter((n) => {
      const d = n.replace(/\D/g, "");
      return d.length >= 7 && d.length <= 15 && !/[a-z]/i.test(n);
    })
    .map((number) => ({
      number,
      type: (isMobileIT(number) ? "mobile" : "landline") as PhoneType,
    }))
    .slice(0, 5);
}

// ── Booking detection ──────────────────────────────────────────────────────

function detectBooking(html: string, links: string[]): {
  hasBooking: boolean; provider: string; visibility: BookingVisibility;
} {
  const low = html.toLowerCase();
  const normalizedLinks = links.map((l) => l.toLowerCase());
  let provider = "";
  for (const p of BOOKING_PROVIDER_PATTERNS) {
    if (low.includes(p)) { provider = p; break; }
  }
  const hasText = BOOKING_TEXT_PATTERNS.some((p) => low.includes(p));
  const hasPath = BOOKING_PATH_PATTERNS.some((p) => normalizedLinks.some((l) => l.includes(p)));
  const hasForm = /(check-?in|check-?out|adulti|bambini|ospiti).{0,200}(<input|<select)/.test(low);
  const hasBooking = hasText || hasPath || hasForm;
  if (!hasBooking) return { hasBooking: false, provider: "", visibility: "none" };

  const early = low.slice(0, 35000);
  const hidden = /display\s*:\s*none|visibility\s*:\s*hidden|aria-hidden\s*=\s*["']?true/.test(low);
  if (hidden) return { hasBooking: true, provider, visibility: "hidden" };
  if (hasText && /<header|<nav|hero|cta|prenota/.test(early)) {
    return { hasBooking: true, provider, visibility: "above_fold" };
  }
  return { hasBooking: true, provider, visibility: "below_fold" };
}

// ── WhatsApp detection ─────────────────────────────────────────────────────

function detectWhatsapp(html: string, links: string[]): { hasWhatsapp: boolean; link: string | null } {
  const bag = `${html}\n${links.join("\n")}`.toLowerCase();
  for (const p of WHATSAPP_PATTERNS) {
    if (bag.includes(p)) {
      const match = bag.match(/https?:\/\/wa\.me\/[^\s"'<>]+/i);
      return { hasWhatsapp: true, link: match ? match[0] : null };
    }
  }
  return { hasWhatsapp: false, link: null };
}

// ── Chatbot detection ──────────────────────────────────────────────────────

function detectChatbot(html: string): { hasChatbot: boolean; provider: string } {
  const low = html.toLowerCase();
  for (const p of CHATBOT_PROVIDERS) {
    if (p.re.test(low)) return { hasChatbot: true, provider: p.name };
  }
  return { hasChatbot: false, provider: "" };
}

// ── Social channel detection ───────────────────────────────────────────────

function detectSocialChannels(html: string, links: string[]): ScoutedSocial[] {
  const bag = `${html}\n${links.join("\n")}`.toLowerCase();
  const found: ScoutedSocial[] = [];
  for (const { name, re } of SOCIAL_PATTERNS) {
    if (re.test(bag)) {
      const linkRe = new RegExp(`https?://[^\\s"'<>]*${name}[^\\s"'<>]*`, "i");
      const match = bag.match(linkRe);
      found.push({ platform: name, url: match ? match[0] : "" });
    }
  }
  return found;
}

// ── Location detection (multiple offices) ──────────────────────────────────

function detectLocations(html: string): ScoutedLocation[] {
  const addressRe = /(?:via|viale|piazza|corso|vicolo|largo|piazzale)\s+[a-z\s.]+\s*,?\s*\d+[a-z]?\s*,?\s*\d{5}\s+[a-z\s]+/gi;
  const raw = [...new Set(html.match(addressRe) ?? [])];
  return raw.slice(0, 10).map((addr) => {
    const cleaned = addr.replace(/\s+/g, " ").trim();
    const capMatch = cleaned.match(/\d{5}\s+([a-z\s]+)/i);
    return { address: cleaned, city: capMatch ? capMatch[1].trim() : null };
  });
}

// ── Main scout function ────────────────────────────────────────────────────

export async function scoutWebsite(websiteUrl: string): Promise<WebScoutResult> {
  if (!websiteUrl) {
    return { status: "no_website", websiteUrl: "", businessName: null, emails: [], phones: [], hasBooking: false,
      bookingProvider: "", bookingVisibility: "none", hasWhatsapp: false, whatsappLink: null,
      hasChatbot: false, chatbotProvider: "", hasContactForm: false,
      socialChannels: [], locations: [], checkedUrls: [], evidenceLevel: "low" };
  }

  try {
    const mainPage = await fetchPage(websiteUrl, 6_000);
    if (!mainPage) return { status: "fetch_error", websiteUrl, businessName: null, emails: [], phones: [], hasBooking: false,
      bookingProvider: "", bookingVisibility: "none", hasWhatsapp: false, whatsappLink: null,
      hasChatbot: false, chatbotProvider: "", hasContactForm: false,
      socialChannels: [], locations: [], checkedUrls: [], evidenceLevel: "low", error: "HTTP fetch failed" };

    const low = mainPage.html.toLowerCase();
    const baseUrl = new URL(mainPage.finalUrl);
    const titleMatch = mainPage.html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i)
      ?? mainPage.html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const businessName = titleMatch?.[1]
      ?.replace(/\s*[|–—-]\s*(home|homepage|sito ufficiale).*$/i, "")
      .replace(/\s+/g, " ").trim().slice(0, 160)
      || baseUrl.hostname.replace(/^www\./, "");
    const links = extractHrefLinks(low).map((l) => toAbsoluteUrl(baseUrl.toString(), l)).filter(Boolean);
    const checkedUrls = new Set<string>([mainPage.finalUrl]);

    // Probe sub-pages for richer signals (contacts, booking, locations).
    const probePaths = [
      ...links.filter((l) => {
        try {
          const candidate = new URL(l);
          return candidate.origin === baseUrl.origin
            && /\/contatti|\/contact|\/contattaci|\/dove-siamo|\/sedi|\/chi-siamo|\/prenota|\/camere|\/rooms/.test(candidate.pathname.toLowerCase());
        } catch { return false; }
      }),
    ].slice(0, 2);

    const subPages: string[] = [low];
    for (const probe of probePaths) {
      checkedUrls.add(probe);
      const subPage = await fetchPage(probe, 3_000);
      if (subPage && new URL(subPage.finalUrl).origin === baseUrl.origin) subPages.push(subPage.html.toLowerCase());
    }

    const mergedHtml = subPages.join("\n");
    const mergedLinks = [...new Set(
      subPages.flatMap((h) => extractHrefLinks(h).map((l) => toAbsoluteUrl(baseUrl.toString(), l)).filter(Boolean))
    )];

    const emails = extractEmails(mergedHtml, mergedLinks);
    const phoneResults = extractPhones(mergedHtml);
    const booking = detectBooking(mergedHtml, mergedLinks);
    const whatsapp = detectWhatsapp(mergedHtml, mergedLinks);
    const chatbot = detectChatbot(mergedHtml);
    const social = detectSocialChannels(mergedHtml, mergedLinks);
    const locations = detectLocations(mergedHtml);

    const evidenceLevel: EvidenceLevel =
      checkedUrls.size >= 4 ? "high" : checkedUrls.size >= 2 ? "medium" : "low";

    return {
      status: "ok",
      websiteUrl: mainPage.finalUrl,
      businessName,
      emails: emails.valid.map((address) => ({ address, quality: emails.quality })),
      phones: phoneResults,
      hasBooking: booking.hasBooking,
      bookingProvider: booking.provider,
      bookingVisibility: booking.visibility,
      hasWhatsapp: whatsapp.hasWhatsapp,
      whatsappLink: whatsapp.link,
      hasChatbot: chatbot.hasChatbot,
      chatbotProvider: chatbot.provider,
      hasContactForm: /<form|contattaci|contact us/.test(mergedHtml),
      socialChannels: social,
      locations,
      checkedUrls: [...checkedUrls],
      evidenceLevel,
    };
  } catch {
    return { status: "fetch_error", websiteUrl, businessName: null, emails: [], phones: [], hasBooking: false,
      bookingProvider: "", bookingVisibility: "none", hasWhatsapp: false, whatsappLink: null,
      hasChatbot: false, chatbotProvider: "", hasContactForm: false,
      socialChannels: [], locations: [], checkedUrls: [], evidenceLevel: "low", error: "Unexpected error during scout" };
  }
}
