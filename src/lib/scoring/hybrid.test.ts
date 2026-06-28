import { describe, expect, it } from "vitest";
import type { WebsiteAssessment } from "@/lib/ai/contracts";
import { scoreLead } from "./deterministic";
import { combineScores, HYBRID_SCORE_VERSION } from "./hybrid";

const deterministic = scoreLead({
  businessName: "Hotel Aurora",
  region: "Emilia-Romagna",
  category: "hotel",
  phone: "+39 0541 000000",
  websiteUrl: "https://example.com",
  rating: 4.6,
  reviewCount: 120,
  hasBooking: undefined,
  businessStatus: "OPERATIONAL",
});

const assessment: WebsiteAssessment = {
  summary: "Domanda solida e prenotazione solo telefonica.",
  advisoryScore: 86,
  recommendedService: "booking-conversione",
  confidence: 0.84,
  opportunities: [{
    service: "booking-conversione",
    evidence: "Il sito invita gli utenti a telefonare per prenotare.",
    sourceUrl: "https://example.com/prenota",
    rationale: "Un percorso digitale ridurrebbe l'attrito.",
  }],
  risks: [],
  missingEvidence: [],
  outreachAngle: "Verificare il percorso di prenotazione.",
  sources: ["https://example.com/prenota"],
};

describe("combineScores", () => {
  it("mantiene il deterministico quando l'AI non è disponibile", () => {
    const result = combineScores(deterministic);
    expect(result.score).toBe(deterministic.score);
    expect(result.aiWeight).toBe(0);
  });

  it("usa OpenAI con peso controllato quando prove e confidenza sono sufficienti", () => {
    const result = combineScores(deterministic, assessment);
    expect(result.aiWeight).toBeGreaterThanOrEqual(0.3);
    expect(result.aiWeight).toBeLessThanOrEqual(0.45);
    expect(result.score).toBeGreaterThan(deterministic.score);
    expect(result.recommendedService).toBe("booking-conversione");
    expect(result.version).toBe(HYBRID_SCORE_VERSION);
  });

  it("ignora un assessment debole o senza evidenze", () => {
    const result = combineScores(deterministic, {
      ...assessment,
      confidence: 0.55,
      opportunities: [],
    });
    expect(result.score).toBe(deterministic.score);
    expect(result.aiWeight).toBe(0);
    expect(result.reasoning).toContain("esclusa");
  });
});
