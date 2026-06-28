import { z } from "zod";

export const WEBSITE_ASSESSMENT_VERSION = "website-assessment-v2026.06.28-2";

export const serviceSlugSchema = z.enum([
  "sito-nuovo",
  "restyling-sito",
  "automazioni",
  "ads-setup",
  "booking-conversione",
  "branding-leggero",
]);

export const websiteAssessmentSchema = z.object({
  summary: z.string().min(1).max(600),
  advisoryScore: z.number().int().min(0).max(100),
  recommendedService: serviceSlugSchema,
  confidence: z.number().min(0).max(1),
  opportunities: z.array(z.object({
    service: serviceSlugSchema,
    evidence: z.string().min(1).max(300),
    sourceUrl: z.url().max(2048),
    rationale: z.string().min(1).max(300),
  })).max(4),
  risks: z.array(z.string().min(1).max(240)).max(4),
  missingEvidence: z.array(z.string().min(1).max(160)).max(6),
  outreachAngle: z.string().min(1).max(500),
  sources: z.array(z.url().max(2048)).min(1).max(8),
});

export type WebsiteAssessment = z.infer<typeof websiteAssessmentSchema>;

export type WebsiteEvidence = {
  businessName: string;
  category: string;
  sourceUrl: string;
  pageTitle: string;
  visibleText: string;
};

export type WebsiteDomainInput = {
  businessName: string;
  category: string;
  websiteUrl: string;
};

export function normalizeWebsiteEvidence(input: WebsiteEvidence): WebsiteEvidence {
  return {
    businessName: input.businessName.trim().slice(0, 200),
    category: input.category.trim().slice(0, 200),
    sourceUrl: input.sourceUrl.trim().slice(0, 2048),
    pageTitle: input.pageTitle.replace(/\s+/g, " ").trim().slice(0, 300),
    visibleText: input.visibleText.replace(/\s+/g, " ").trim().slice(0, 20_000),
  };
}
