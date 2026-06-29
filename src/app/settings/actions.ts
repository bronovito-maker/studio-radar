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
  cronLocation: z.string().trim().max(100).optional().default(""),
  cronRegion: z.string().trim().max(100).optional().default(""),
  emailEnabled: z.boolean(),
  emailSenderName: z.string().trim().min(1).max(120),
  emailSenderEmail: z.string().trim().max(254).refine((entry) => !entry || z.email().safeParse(entry).success, "Email mittente non valida").transform((entry) => entry || null),
  emailReplyTo: z.string().trim().max(254).refine((entry) => !entry || z.email().safeParse(entry).success, "Reply-to non valido").transform((entry) => entry || null),
  emailDailyLimit: z.coerce.number().int().min(1).max(300),
  emailFollowUpEnabled: z.boolean(),
  emailFollowUpDelays: z.array(z.coerce.number().int().min(1).max(30)).length(3)
    .refine((days) => days[0] < days[1] && days[1] < days[2], "I follow-up devono essere in ordine crescente"),
  cronPageSize: z.coerce.number().int().min(1).max(50),
  emailAutoOutreachEnabled: z.boolean(),
}).refine((data) => !data.cronEnabled || (data.cronLocation.length >= 2 || data.cronRegion.length >= 2), {
  message: "Se il cron è attivo, specifica almeno una città o una regione",
  path: ["cronLocation"],
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
    emailEnabled: formData.get("emailEnabled") === "on",
    emailSenderName: value(formData, "emailSenderName"),
    emailSenderEmail: value(formData, "emailSenderEmail"),
    emailReplyTo: value(formData, "emailReplyTo"),
    emailDailyLimit: value(formData, "emailDailyLimit"),
    emailFollowUpEnabled: formData.get("emailFollowUpEnabled") === "on",
    emailFollowUpDelays: [value(formData, "followUpDay1"), value(formData, "followUpDay2"), value(formData, "followUpDay3")],
    cronPageSize: value(formData, "cronPageSize") || "20",
    emailAutoOutreachEnabled: formData.get("emailAutoOutreachEnabled") === "on",
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
      email_enabled: parsed.data.emailEnabled,
      email_sender_name: parsed.data.emailSenderName,
      email_sender_email: parsed.data.emailSenderEmail,
      email_reply_to: parsed.data.emailReplyTo,
      email_daily_limit: parsed.data.emailDailyLimit,
      email_follow_up_enabled: parsed.data.emailFollowUpEnabled,
      email_follow_up_delays: parsed.data.emailFollowUpDelays,
      cron_page_size: parsed.data.cronPageSize,
      email_auto_outreach_enabled: parsed.data.emailAutoOutreachEnabled,
    })
    .eq("id", 1);
  if (error) redirect("/settings?error=Impostazioni%20non%20salvate");

  revalidatePath("/settings");
  redirect("/settings?success=Impostazioni%20aggiornate");
}
