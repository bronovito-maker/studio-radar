import { describe, expect, it } from "vitest";
import { DETERMINISTIC_SCORE_VERSION, scoreLead } from "./deterministic";

const strongRestaurant = {
  businessName: "Ristorante Aurora",
  region: "Emilia-Romagna",
  category: "ristorante",
  phone: "+39 051 000000",
  email: "info@example.com",
  websiteUrl: null,
  websiteVerification: "not_detected" as const,
  rating: 4.6,
  reviewCount: 400,
  hasBooking: false,
  businessStatus: "OPERATIONAL" as const,
  source: "google_places" as const,
};

describe("scoreLead V2", () => {
  it("sceglie la migliore offerta eleggibile", () => {
    const result = scoreLead(strongRestaurant);
    expect(result.offerScores.siteNew).toBeGreaterThan(80);
    expect(result.offerScores.websiteRedesign).toBe(0);
    expect(result.offerScores.ads).toBeNull();
    expect(result.recommendedService).toBe("sito-nuovo");
    expect(result.opportunityScore).toBe(result.offerScores.siteNew);
    expect(result.version).toBe(DETERMINISTIC_SCORE_VERSION);
  });

  it("distingue sito non adatto da sito non valutabile", () => {
    const unknown = scoreLead({ businessName: "Lead manuale", websiteVerification: "unknown" });
    const present = scoreLead({ businessName: "Lead con sito", websiteUrl: "https://example.com" });
    expect(unknown.offerScores.siteNew).toBeNull();
    expect(present.offerScores.siteNew).toBe(0);
    expect(present.offerScores.websiteRedesign).toBeNull();
  });

  it("richiede verifica manuale quando Google non rileva il sito", () => {
    const result = scoreLead(strongRestaurant);
    expect(result.confidence).toBeGreaterThanOrEqual(75);
    expect(result.nextAction).toBe("manual_verify");
    expect(result.unknowns).toContain("website_absence_unconfirmed");
  });

  it("consiglia booking solo quando categoria e assenza sono note", () => {
    const eligible = scoreLead({
      ...strongRestaurant,
      websiteUrl: "https://example.com",
      websiteVerification: "verified_present",
      hasBooking: false,
    });
    const unknown = scoreLead({ ...strongRestaurant, hasBooking: undefined });
    const irrelevant = scoreLead({ ...strongRestaurant, category: "negozio di abbigliamento", hasBooking: false });
    expect(eligible.offerScores.booking).toBeGreaterThan(0);
    expect(unknown.offerScores.booking).toBeNull();
    expect(irrelevant.offerScores.booking).toBe(0);
  });

  it("non valuta restyling e automazioni senza analisi digitale", () => {
    const result = scoreLead({
      ...strongRestaurant,
      category: "hotel",
      websiteUrl: "https://example.com",
      websiteVerification: "verified_present",
      hasBooking: true,
    });
    expect(result.offerScores.websiteRedesign).toBeNull();
    expect(result.offerScores.automation).toBeNull();
  });

  it("valuta gap tecnici solo quando forniti come dati strutturati", () => {
    const result = scoreLead({
      ...strongRestaurant,
      category: "hotel",
      websiteUrl: "https://example.com",
      websiteVerification: "verified_present",
      hasBooking: true,
      digitalAnalysis: { completed: true, websiteWeakness: 80, automationPotential: 70 },
    });
    expect(result.offerScores.websiteRedesign).toBeGreaterThan(0);
    expect(result.offerScores.automation).toBeGreaterThan(0);
    expect(result.confidence).toBe(100);
  });

  it("azzera le attività chiuse definitivamente", () => {
    const result = scoreLead({ ...strongRestaurant, businessStatus: "CLOSED_PERMANENTLY" });
    expect(result.opportunityScore).toBe(0);
    expect(result.nextAction).toBe("ignore");
    expect(Object.values(result.offerScores).filter((score) => score !== null)).toEqual(expect.arrayContaining([0]));
  });

  it("limita le attività temporaneamente chiuse", () => {
    const result = scoreLead({ ...strongRestaurant, businessStatus: "CLOSED_TEMPORARILY" });
    expect(result.opportunityScore).toBeLessThanOrEqual(35);
    expect(result.nextAction).toBe("ignore");
  });

  it("mantiene confidence separata dall'opportunità", () => {
    const incomplete = scoreLead({
      businessName: "Lead incompleto",
      category: "ristorante",
      websiteVerification: "not_detected",
      rating: 4.6,
      reviewCount: 300,
    });
    expect(incomplete.opportunityScore).toBeGreaterThanOrEqual(40);
    expect(incomplete.confidence).toBeLessThan(60);
    expect(incomplete.nextAction).toBe("enrich_data");
  });

  it("è deterministico e limita ogni numero tra 0 e 100", () => {
    const first = scoreLead(strongRestaurant);
    expect(first).toEqual(scoreLead(strongRestaurant));
    expect(first.opportunityScore).toBeGreaterThanOrEqual(0);
    expect(first.opportunityScore).toBeLessThanOrEqual(100);
    expect(Object.values(first.components).every((value) => value >= 0 && value <= 100)).toBe(true);
  });
});
