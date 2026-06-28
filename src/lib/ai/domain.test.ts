import { describe, expect, it } from "vitest";
import { officialWebsiteDomain, sourceBelongsToDomain } from "./domain";

describe("official website domain guard", () => {
  it("normalizes www and accepts official subdomains as sources", () => {
    const domain = officialWebsiteDomain("https://www.example.com/contatti");
    expect(domain).toBe("example.com");
    expect(sourceBelongsToDomain("https://booking.example.com/prenota", domain)).toBe(true);
  });

  it("rejects deceptive and unrelated source domains", () => {
    const domain = officialWebsiteDomain("https://example.com");
    expect(sourceBelongsToDomain("https://example.com.evil.test/report", domain)).toBe(false);
    expect(sourceBelongsToDomain("https://directory.test/example", domain)).toBe(false);
  });

  it("rejects local hosts, IP addresses and embedded credentials", () => {
    expect(() => officialWebsiteDomain("http://localhost:3000")).toThrow();
    expect(() => officialWebsiteDomain("http://127.0.0.1/private")).toThrow();
    expect(() => officialWebsiteDomain("https://user:secret@example.com")).toThrow();
  });
});
