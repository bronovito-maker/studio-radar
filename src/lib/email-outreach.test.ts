import { describe, expect, it } from "vitest";
import { EMAIL_OPTOUT_FOOTER, followUpBodies, withOptOut } from "./email-outreach";

describe("email outreach", () => {
  it("adds the opt-out notice exactly once", () => {
    const once = withOptOut("Un messaggio sufficientemente lungo per il destinatario.");
    expect(once).toContain(EMAIL_OPTOUT_FOOTER);
    expect(withOptOut(once)).toBe(once);
  });

  it("creates three distinct follow-ups with opt-out", () => {
    const messages = followUpBodies("Hotel Demo");
    expect(messages).toHaveLength(3);
    expect(new Set(messages).size).toBe(3);
    expect(messages.every((message) => message.includes(EMAIL_OPTOUT_FOOTER))).toBe(true);
  });
});
