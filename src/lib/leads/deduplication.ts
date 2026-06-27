import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type DedupeCandidate = {
  emailNormalized: string | null;
  phoneNormalized: string | null;
  websiteNormalized: string | null;
  businessCityNormalized: string;
};

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function dedupeKeys(candidate: DedupeCandidate) {
  return [
    candidate.emailNormalized ? `email:${candidate.emailNormalized}` : null,
    candidate.phoneNormalized ? `phone:${candidate.phoneNormalized}` : null,
    candidate.websiteNormalized ? `website:${candidate.websiteNormalized}` : null,
    `business:${candidate.businessCityNormalized}`,
  ].filter((key): key is string => Boolean(key));
}

export async function findExistingLeadKeys(
  supabase: SupabaseClient<Database>,
  candidates: DedupeCandidate[],
) {
  const select = "id, email_normalized, phone_normalized, website_normalized, business_city_normalized";
  const queries = [
    ...chunk([...new Set(candidates.flatMap((item) => item.emailNormalized ? [item.emailNormalized] : []))], 100)
      .map((values) => supabase.from("leads").select(select).in("email_normalized", values)),
    ...chunk([...new Set(candidates.flatMap((item) => item.phoneNormalized ? [item.phoneNormalized] : []))], 100)
      .map((values) => supabase.from("leads").select(select).in("phone_normalized", values)),
    ...chunk([...new Set(candidates.flatMap((item) => item.websiteNormalized ? [item.websiteNormalized] : []))], 100)
      .map((values) => supabase.from("leads").select(select).in("website_normalized", values)),
    ...chunk([...new Set(candidates.map((item) => item.businessCityNormalized))], 100)
      .map((values) => supabase.from("leads").select(select).in("business_city_normalized", values)),
  ];
  const results = await Promise.all(queries);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error("LEAD_DEDUPE_QUERY_FAILED", { cause: failed.error });

  const keys = new Map<string, string>();
  results.flatMap((result) => result.data ?? []).forEach((lead) => {
    if (lead.email_normalized) keys.set(`email:${lead.email_normalized}`, lead.id);
    if (lead.phone_normalized) keys.set(`phone:${lead.phone_normalized}`, lead.id);
    if (lead.website_normalized) keys.set(`website:${lead.website_normalized}`, lead.id);
    if (lead.business_city_normalized) keys.set(`business:${lead.business_city_normalized}`, lead.id);
  });
  return keys;
}
