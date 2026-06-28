import { describe, expect, it } from "vitest";
import { candidateEnrichmentSchema, normalizeWebsiteEvidence, outreachDraftSchema, websiteAssessmentSchema } from "./contracts";

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
        sourceUrl: "https://example.com/prenota",
        rationale: "Un flusso online ridurrebbe l'attrito.",
      }],
      risks: [],
      missingEvidence: ["Dati sul tasso di conversione"],
      outreachAngle: "Proporre una verifica del percorso di prenotazione.",
      sources: ["https://example.com/prenota"],
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
      sources: ["https://example.com"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a candidate profile with explicit missing fields and official sources", () => {
    expect(candidateEnrichmentSchema.safeParse({
      businessName: "Studio Radar",
      category: "Agenzia web",
      city: "Rimini",
      region: "Emilia-Romagna",
      phone: null,
      email: null,
      address: null,
      websiteUrl: "https://example.com",
      hasBooking: null,
      confidence: 0.72,
      missingEvidence: ["Telefono", "Email"],
      sources: ["https://example.com/contatti"],
      fieldSources: {
        businessName: "https://example.com",
        category: "https://example.com",
        city: "https://example.com/contatti",
        region: "https://example.com/contatti",
        phone: null,
        email: null,
        address: null,
        websiteUrl: "https://example.com",
        hasBooking: null,
      },
    }).success).toBe(true);
  });

  it("rejects malformed candidate contact data", () => {
    expect(candidateEnrichmentSchema.safeParse({
      businessName: "Studio Radar",
      category: "Agenzia web",
      city: null,
      region: null,
      phone: null,
      email: "non-una-email",
      address: null,
      websiteUrl: "https://example.com",
      hasBooking: null,
      confidence: 0.7,
      missingEvidence: [],
      sources: ["https://example.com"],
    }).success).toBe(false);
  });

  it("accepts a concise outreach draft with traceable facts", () => {
    expect(outreachDraftSchema.safeParse({
      message: "Buongiorno, abbiamo notato un possibile miglioramento nel percorso di prenotazione. Possiamo condividere due spunti concreti in un breve confronto?",
      confidence: 0.78,
      factsUsed: ["Prenotazione indicata solo via telefono"],
      cautions: ["Verificare il referente"],
    }).success).toBe(true);
  });
});
