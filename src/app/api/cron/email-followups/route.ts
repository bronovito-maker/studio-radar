import { NextResponse } from "next/server";
import { BrevoError, isBrevoConfigured, sendBrevoEmail } from "@/lib/brevo";
import { hasBearerToken } from "@/lib/request-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!hasBearerToken(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "SERVER_NOT_CONFIGURED" }, { status: 503 });
  }

  const { data: settings } = await supabase.from("settings").select(
    "email_enabled, email_follow_up_enabled, email_daily_limit, email_sender_name, email_sender_email, email_reply_to",
  ).eq("id", 1).single();
  if (!settings?.email_enabled || !settings.email_follow_up_enabled) return NextResponse.json({ status: "disabled" });
  if (!settings.email_sender_email || !isBrevoConfigured()) {
    return NextResponse.json({ error: "EMAIL_NOT_CONFIGURED" }, { status: 503 });
  }

  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count: sentToday } = await supabase.from("email_messages")
    .select("id", { count: "exact", head: true })
    .gte("sent_at", startOfDay.toISOString());
  const capacity = Math.max(0, settings.email_daily_limit - (sentToday ?? 0));
  if (!capacity) return NextResponse.json({ status: "limit_reached", sent: 0 });

  const { data: due } = await supabase.from("email_messages")
    .select("id, lead_id, recipient_email, recipient_name, subject, body, attempt_count")
    .eq("status", "queued")
    .eq("kind", "follow_up")
    .lte("scheduled_for", new Date().toISOString())
    .order("scheduled_for")
    .limit(Math.min(capacity, 50));

  let sent = 0;
  let cancelled = 0;
  let failed = 0;
  for (const message of due ?? []) {
    const { data: claimed } = await supabase.from("email_messages")
      .update({ status: "sending" })
      .eq("id", message.id)
      .eq("status", "queued")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;

    const { data: lead } = await supabase.from("leads")
      .select("status, email_suppressed_at, email_replied_at")
      .eq("id", message.lead_id)
      .single();
    if (!lead || lead.email_suppressed_at || lead.email_replied_at || ["booked", "client", "discarded"].includes(lead.status)) {
      await supabase.from("email_messages").update({ status: "cancelled", cancelled_at: new Date().toISOString(), error_code: "LEAD_NOT_CONTACTABLE" }).eq("id", message.id);
      cancelled += 1;
      continue;
    }

    try {
      const result = await sendBrevoEmail({
        id: message.id,
        toEmail: message.recipient_email,
        toName: message.recipient_name,
        senderEmail: settings.email_sender_email,
        senderName: settings.email_sender_name,
        replyTo: settings.email_reply_to,
        subject: message.subject,
        body: message.body,
      });
      const { error } = await supabase.rpc("record_email_sent", {
        p_email_id: message.id,
        p_provider_message_id: result.messageId,
        p_follow_up_bodies: [],
      });
      if (error) throw error;
      sent += 1;
    } catch (error) {
      const retryable = error instanceof BrevoError && error.retryable && message.attempt_count < 2;
      await supabase.from("email_messages").update(retryable ? {
        status: "queued",
        scheduled_for: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        attempt_count: message.attempt_count + 1,
        error_code: error instanceof BrevoError ? error.code : "RECORDING_ERROR",
      } : {
        status: "failed",
        failed_at: new Date().toISOString(),
        attempt_count: message.attempt_count + 1,
        error_code: error instanceof BrevoError ? error.code : "RECORDING_ERROR",
      }).eq("id", message.id);
      failed += 1;
    }
  }

  return NextResponse.json({ status: "completed", sent, cancelled, failed });
}
