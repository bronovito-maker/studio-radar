import { z } from "zod";

export function compactText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeEmailKey(value: string) {
  const email = compactText(value).toLowerCase();
  return email || null;
}

export function normalizePhoneKey(value: string) {
  const phone = value.replace(/[^0-9]+/g, "");
  return phone.length >= 7 ? phone : null;
}

export function normalizeWebsite(value: string) {
  const candidate = compactText(value);
  if (!candidate) return { display: "", key: null, valid: true };

  const withProtocol = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
  const parsed = z.url().safeParse(withProtocol);
  if (!parsed.success) return { display: candidate, key: null, valid: false };

  const url = new URL(parsed.data);
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  return { display: withProtocol, key: hostname || null, valid: Boolean(hostname) };
}

export function normalizeBusinessCityKey(businessName: string, city: string) {
  return `${compactText(businessName).toLowerCase()}|${compactText(city).toLowerCase()}`;
}
