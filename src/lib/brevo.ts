import "server-only";

export class BrevoError extends Error {
  constructor(
    readonly code: "NOT_CONFIGURED" | "INVALID_RESPONSE" | "RATE_LIMITED" | "PROVIDER_ERROR" | "NETWORK_ERROR",
    readonly retryable: boolean,
  ) {
    super(code);
    this.name = "BrevoError";
  }
}

export type BrevoEmail = {
  id: string;
  toEmail: string;
  toName: string;
  senderEmail: string;
  senderName: string;
  replyTo?: string | null;
  subject: string;
  body: string;
};

function brevoApiKey() {
  const value = process.env.BREVO_API_KEY?.trim();
  return value?.startsWith("xkeysib-") ? value : null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderHtml(body: string) {
  const linked = body.split(/(https?:\/\/[^\s<]+)/g).map((part) => {
    if (!/^https?:\/\//.test(part)) return escapeHtml(part);
    const safe = escapeHtml(part);
    return `<a href="${safe}" rel="noopener noreferrer">${safe}</a>`;
  }).join("");
  return `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#172033">${linked.replaceAll("\n", "<br>")}</div>`;
}

export async function sendBrevoEmail(message: BrevoEmail) {
  const apiKey = brevoApiKey();
  if (!apiKey) throw new BrevoError("NOT_CONFIGURED", false);

  let response: Response;
  try {
    response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: { email: message.senderEmail, name: message.senderName },
        to: [{ email: message.toEmail, name: message.toName }],
        ...(message.replyTo ? { replyTo: { email: message.replyTo } } : {}),
        subject: message.subject,
        textContent: message.body,
        htmlContent: renderHtml(message.body),
        headers: { "X-Mailin-custom": `email_id:${message.id}` },
        tags: ["studio-radar", `email_${message.id}`],
      }),
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch {
    throw new BrevoError("NETWORK_ERROR", true);
  }

  const payload = await response.json().catch(() => null) as { messageId?: unknown } | null;
  if (!response.ok) {
    if (response.status === 429) throw new BrevoError("RATE_LIMITED", true);
    throw new BrevoError("PROVIDER_ERROR", response.status >= 500);
  }
  if (!payload || typeof payload.messageId !== "string" || payload.messageId.length < 3) {
    throw new BrevoError("INVALID_RESPONSE", false);
  }

  return { messageId: payload.messageId };
}

export function isBrevoConfigured() {
  return Boolean(brevoApiKey() && process.env.BREVO_WEBHOOK_TOKEN?.trim());
}
