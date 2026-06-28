import { z } from "zod";

export const WEBSITE_ASSESSMENT_VERSION = "website-assessment-v2026.06.28-2";
export const CANDIDATE_ENRICHMENT_VERSION = "candidate-enrichment-v2026.06.28-2";
export const OUTREACH_DRAFT_VERSION = "outreach-draft-v2026.06.28-1";
const httpUrlSchema = z.string().max(2048).regex(/^https?:\/\/[^\s]+$/);

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
    sourceUrl: httpUrlSchema,
    rationale: z.string().min(1).max(300),
  })).max(4),
  risks: z.array(z.string().min(1).max(240)).max(4),
  missingEvidence: z.array(z.string().min(1).max(160)).max(6),
  outreachAngle: z.string().min(1).max(500),
  sources: z.array(httpUrlSchema).min(1).max(8),
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

export const candidateEnrichmentSchema = z.object({
  businessName: z.string().min(2).max(200),
  category: z.string().min(1).max(200),
  city: z.string().min(1).max(120).nullable(),
  region: z.string().min(1).max(120).nullable(),
  phone: z.string().min(5).max(60).nullable(),
  email: z.email().max(254).nullable(),
  address: z.string().min(3).max(300).nullable(),
  websiteUrl: httpUrlSchema,
  hasBooking: z.boolean().nullable(),
  confidence: z.number().min(0).max(1),
  missingEvidence: z.array(z.string().min(1).max(160)).max(8),
  sources: z.array(httpUrlSchema).min(1).max(10),
  fieldSources: z.object({
    businessName: httpUrlSchema.nullable(),
    category: httpUrlSchema.nullable(),
    city: httpUrlSchema.nullable(),
    region: httpUrlSchema.nullable(),
    phone: httpUrlSchema.nullable(),
    email: httpUrlSchema.nullable(),
    address: httpUrlSchema.nullable(),
    websiteUrl: httpUrlSchema.nullable(),
    hasBooking: httpUrlSchema.nullable(),
  }),
});

export type CandidateEnrichment = z.infer<typeof candidateEnrichmentSchema>;

export const outreachDraftSchema = z.object({
  message: z.string().min(40).max(900),
  confidence: z.number().min(0).max(1),
  factsUsed: z.array(z.string().min(1).max(160)).max(6),
  cautions: z.array(z.string().min(1).max(160)).max(4),
});

export type OutreachDraft = z.infer<typeof outreachDraftSchema>;

export function normalizeWebsiteEvidence(input: WebsiteEvidence): WebsiteEvidence {
  return {
    businessName: input.businessName.trim().slice(0, 200),
    category: input.category.trim().slice(0, 200),
    sourceUrl: input.sourceUrl.trim().slice(0, 2048),
    pageTitle: input.pageTitle.replace(/\s+/g, " ").trim().slice(0, 300),
    visibleText: input.visibleText.replace(/\s+/g, " ").trim().slice(0, 20_000),
  };
}
