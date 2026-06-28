import { describe, expect, it } from "vitest";
import { isScoreSnapshotCurrent } from "./snapshot";

const lead = {
  business_name: "Studio Radar",
  region: "Ticino",
  category: "Agenzia web",
  phone: "+41 91 000 00 00",
  email: "ciao@example.com",
  website_url: "https://example.com",
  rating: 4.5,
  review_count: 20,
  has_booking: false,
};

const snapshot = {
  input: {
    businessName: lead.business_name,
    region: lead.region,
    category: lead.category,
    phone: lead.phone,
    email: lead.email,
    websiteUrl: lead.website_url,
    rating: lead.rating,
    reviewCount: lead.review_count,
  },
};

describe("score snapshot freshness", () => {
  it("accepts the snapshot used for the current lead", () => {
    expect(isScoreSnapshotCurrent(snapshot, lead)).toBe(true);
  });

  it("rejects evidence belonging to an old website", () => {
    expect(isScoreSnapshotCurrent(snapshot, { ...lead, website_url: "https://new.example.com" })).toBe(false);
  });

  it("rejects a snapshot after contact or market data changes", () => {
    expect(isScoreSnapshotCurrent(snapshot, { ...lead, region: "Toscana" })).toBe(false);
    expect(isScoreSnapshotCurrent(snapshot, { ...lead, email: "nuova@example.com" })).toBe(false);
  });
});
