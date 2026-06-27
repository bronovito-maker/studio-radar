import { describe, expect, it } from "vitest";
import { DETERMINISTIC_SCORE_VERSION, scoreLead } from "./deterministic";

const strongHotel = {
  businessName: "Hotel Aurora",
  region: "Emilia-Romagna",
  category: "hotel",
  phone: "+39 051 000000",
  email: null,
  websiteUrl: null,
  rating: 4.6,
  reviewCount: 120,
  hasBooking: false,
  businessStatus: "OPERATIONAL" as const,
};

describe("scoreLead", () => {
  it("assegna priorità a un business forte con opportunità concreta", () => {
    const result = scoreLead(strongHotel);
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.grade).toBe("priority");
    expect(result.recommendedService).toBe("sito-nuovo");
    expect(result.positiveSignals).toContain("website_missing");
    expect(result.version).toBe(DETERMINISTIC_SCORE_VERSION);
  });

  it("mantiene freddo un lead privo di prove e contatti", () => {
    const result = scoreLead({ businessName: "Attività Incerta", reviewCount: 0 });
    expect(result.score).toBeLessThan(40);
    expect(result.grade).toBe("cold");
    expect(result.negativeSignals).toEqual(
      expect.arrayContaining(["category_missing", "reputation_missing", "phone_missing"]),
    );
  });

  it("rispetta la priorità geografica concordata", () => {
    const emilia = scoreLead(strongHotel);
    const lombardia = scoreLead({ ...strongHotel, region: "Lombardia" });
    expect(emilia.score).toBeGreaterThan(lombardia.score);
  });

  it("azzera le attività chiuse definitivamente", () => {
    const result = scoreLead({ ...strongHotel, businessStatus: "CLOSED_PERMANENTLY" });
    expect(result.score).toBe(0);
    expect(result.negativeSignals).toContain("business_closed_permanently");
  });

  it("consiglia booking quando sito e domanda sono già presenti", () => {
    const result = scoreLead({
      ...strongHotel,
      category: "studio dentistico",
      websiteUrl: "https://example.com",
      hasBooking: false,
    });
    expect(result.recommendedService).toBe("booking-conversione");
    expect(result.positiveSignals).toContain("booking_opportunity");
  });

  it("è deterministico e resta sempre tra 0 e 100", () => {
    expect(scoreLead(strongHotel)).toEqual(scoreLead(strongHotel));
    expect(scoreLead(strongHotel).score).toBeLessThanOrEqual(100);
    expect(scoreLead({ businessName: "X", businessStatus: "CLOSED_PERMANENTLY" }).score).toBe(0);
  });
});
