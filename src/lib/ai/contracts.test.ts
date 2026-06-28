import { describe, expect, it } from "vitest";
import { normalizeWebsiteEvidence, websiteAssessmentSchema } from "./contracts";

describe("website AI contracts", () => {
  it("normalizes and bounds website evidence", () => {
    const evidence = normalizeWebsiteEvidence({
      businessName: "  Studio Radar  ",
      category: " Agenzia web ",
      sourceUrl: " https://example.com ",
      pageTitle: "Titolo\n   pagina",
      visibleText: `${"a".repeat(21_000)}   finale`,
    });

    expect(evidence.businessName).toBe("Studio Radar");
    expect(evidence.pageTitle).toBe("Titolo pagina");
    expect(evidence.visibleText).toHaveLength(20_000);
  });

  it("accepts a complete structured assessment", () => {
    expect(websiteAssessmentSchema.safeParse({
      summary: "Presenza digitale attiva con opportunita di conversione.",
      advisoryScore: 72,
      recommendedService: "booking-conversione",
      confidence: 0.81,
      opportunities: [{
        service: "booking-conversione",
        evidence: "Il sito invita a telefonare per prenotare.",
        rationale: "Un flusso online ridurrebbe l'attrito.",
      }],
      risks: [],
      missingEvidence: ["Dati sul tasso di conversione"],
      outreachAngle: "Proporre una verifica del percorso di prenotazione.",
    }).success).toBe(true);
  });

  it("rejects invented service identifiers and invalid confidence", () => {
    const result = websiteAssessmentSchema.safeParse({
      summary: "Test",
      advisoryScore: 50,
      recommendedService: "servizio-inventato",
      confidence: 2,
      opportunities: [],
      risks: [],
      missingEvidence: [],
      outreachAngle: "Test",
    });
    expect(result.success).toBe(false);
  });
});
