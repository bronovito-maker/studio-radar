import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { hasBearerToken } from "@/lib/request-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const webhookEventSchema = z.object({
  event: z.string().trim().min(1).max(80),
  email: z.string().trim().max(254).optional(),
  tags: z.array(z.string()).optional(),
  tag: z.string().optional(),
  ts_event: z.coerce.number().int().positive().optional(),
  ts: z.coerce.number().int().positive().optional(),
  ts_epoch: z.coerce.number().int().positive().optional(),
  "message-id": z.string().trim().max(500).optional(),
  "X-Mailin-custom": z.string().trim().max(500).optional(),
}).passthrough();

function normalizedEvent(value: string) {
  const normalized = value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
  return normalized === "hardbounce" ? "hard_bounce"
    : normalized === "softbounce" ? "soft_bounce"
      : normalized === "uniqueopened" ? "unique_opened"
        : normalized === "loaded_by_proxy" ? "proxy_open"
        : normalized;
}

function emailIdFromEvent(event: z.infer<typeof webhookEventSchema>) {
  const values = [event["X-Mailin-custom"], ...(event.tags ?? []), event.tag].filter((value): value is string => Boolean(value));
  for (const value of values) {
    const match = value.match(/(?:email_id:|email_)([0-9a-f]{8}-[0-9a-f-]{27,})/i);
    const parsed = z.uuid().safeParse(match?.[1]);
    if (parsed.success) return parsed.data;
  }
  return null;
}

function occurredAt(event: z.infer<typeof webhookEventSchema>) {
  if (event.ts_event) return new Date(event.ts_event * 1000).toISOString();
  if (event.ts_epoch) return new Date(event.ts_epoch > 10_000_000_000 ? event.ts_epoch : event.ts_epoch * 1000).toISOString();
  if (event.ts) return new Date(event.ts * 1000).toISOString();
  return new Date().toISOString();
}

export async function POST(request: Request) {
  if (!hasBearerToken(request, process.env.BREVO_WEBHOOK_TOKEN)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const raw = await request.json().catch(() => null);
  const items = Array.isArray(raw) ? raw : [raw];
  if (!items.length || items.length > 500) return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });

  let supabase: ReturnType<typeof createAdminClient>;
  try {
    supabase = createAdminClient();
  } catch {
    return NextResponse.json({ error: "SERVER_NOT_CONFIGURED" }, { status: 503 });
  }

  let accepted = 0;
  for (const item of items) {
    const parsed = webhookEventSchema.safeParse(item);
    if (!parsed.success) continue;
    const event = parsed.data;
    const providerMessageId = event["message-id"] ?? "";
    let emailId = emailIdFromEvent(event);
    if (!emailId && providerMessageId) {
      const { data } = await supabase.from("email_messages").select("id").eq("provider_message_id", providerMessageId).limit(1).maybeSingle();
      emailId = data?.id ?? null;
    }
    if (!emailId) continue;

    const eventType = normalizedEvent(event.event);
    const eventKey = createHash("sha256").update(JSON.stringify({
      emailId,
      eventType,
      providerMessageId,
      timestamp: event.ts_event ?? event.ts_epoch ?? event.ts ?? null,
      link: typeof item?.link === "string" ? item.link : null,
    })).digest("hex");
    const { data, error } = await supabase.rpc("record_email_provider_event", {
      p_email_id: emailId,
      p_event_key: eventKey,
      p_event_type: eventType,
      p_provider_message_id: providerMessageId,
      p_occurred_at: occurredAt(event),
      p_payload: event as unknown as Json,
    });
    if (!error && data) accepted += 1;
  }

  return NextResponse.json({ accepted });
}
