import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type RateLimitScope =
  | "places_search"
  | "candidate_enrichment"
  | "lead_ai_analysis"
  | "outreach_draft"
  | "csv_import";

export async function consumeRateLimit(
  supabase: SupabaseClient<Database>,
  scope: RateLimitScope,
) {
  const { data, error } = await supabase.rpc("consume_rate_limit", { p_scope: scope });
  if (error) {
    console.error("Rate limit check failed", { scope, code: error.code });
    return false;
  }
  return data === true;
}
