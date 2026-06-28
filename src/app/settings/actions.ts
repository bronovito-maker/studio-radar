"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { DISCOVERY_CATEGORIES } from "@/lib/places/categories";
import { createClient } from "@/lib/supabase/server";

const settingsSchema = z.object({
  bookingUrl: z.string().trim().max(2048).refine((entry) => !entry || z.url().safeParse(entry).success, "Booking URL non valido").transform((entry) => entry || null),
  scoreThreshold: z.coerce.number().int().min(0).max(100),
  cronEnabled: z.boolean(),
  cronCategory: z.enum(DISCOVERY_CATEGORIES),
  cronLocation: z.string().trim().min(2).max(100),
  cronRegion: z.enum(["Emilia-Romagna", "Toscana", "Lombardia"]),
});

function value(formData: FormData, key: string) {
  const entry = formData.get(key);
  return typeof entry === "string" ? entry : "";
}

export async function updateSettingsAction(formData: FormData) {
  await requireAdmin();
  const parsed = settingsSchema.safeParse({
    bookingUrl: value(formData, "bookingUrl"),
    scoreThreshold: value(formData, "scoreThreshold"),
    cronEnabled: formData.get("cronEnabled") === "on",
    cronCategory: value(formData, "cronCategory"),
    cronLocation: value(formData, "cronLocation"),
    cronRegion: value(formData, "cronRegion"),
  });
  if (!parsed.success) {
    redirect(`/settings?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Dati non validi")}`);
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("settings")
    .update({
      booking_url: parsed.data.bookingUrl,
      default_score_threshold: parsed.data.scoreThreshold,
      cron_enabled: parsed.data.cronEnabled,
      cron_category: parsed.data.cronCategory,
      cron_location: parsed.data.cronLocation,
      cron_region: parsed.data.cronRegion,
    })
    .eq("id", 1);
  if (error) redirect("/settings?error=Impostazioni%20non%20salvate");

  revalidatePath("/settings");
  redirect("/settings?success=Impostazioni%20aggiornate");
}
