"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const settingsSchema = z.object({
  bookingUrl: z.string().trim().max(2048).refine((entry) => !entry || z.url().safeParse(entry).success, "Booking URL non valido").transform((entry) => entry || null),
  scoreThreshold: z.coerce.number().int().min(0).max(100),
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
    })
    .eq("id", 1);
  if (error) redirect("/settings?error=Impostazioni%20non%20salvate");

  revalidatePath("/settings");
  redirect("/settings?success=Impostazioni%20aggiornate");
}
