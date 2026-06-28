export const DETERMINISTIC_SCORE_VERSION = "deterministic-v2026.06.28-3";

export type ScoreGrade = "cold" | "warm" | "hot" | "priority";
export type RecommendedService = "sito-nuovo" | "restyling-sito" | "booking-conversione" | "automazioni";
export type NextAction = "contact_now" | "manual_verify" | "enrich_data" | "ignore";
export type WebsiteVerification = "verified_present" | "not_detected" | "unknown";
export type OfferScore = number | null;

export type DeterministicScoreInput = {
  businessName: string;
  region?: string | null;
  category?: string | null;
  phone?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  websiteVerification?: WebsiteVerification;
  rating?: number | null;
  reviewCount?: number | null;
  hasBooking?: boolean;
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | null;
  source?: "manual" | "csv" | "google_places";
  googlePlaceId?: string | null;
  digitalAnalysis?: {
    completed: boolean;
    websiteWeakness: number | null;
    automationPotential: number | null;
  };
};

export type ScoreComponents = {
  businessViability: number;
  contactability: number;
  commercialSafety: number;
  digitalEvidenceCompleteness: number;
};

export type OfferScores = {
  siteNew: OfferScore;
  websiteRedesign: OfferScore;
  booking: OfferScore;
  automation: OfferScore;
  ads: null;
  branding: null;
};

export type DeterministicScoreResult = {
  version: string;
  score: number;
  opportunityScore: number;
  confidence: number;
  grade: ScoreGrade;
  recommendedService: RecommendedService | null;
  nextAction: NextAction;
  offerScores: OfferScores;
  components: ScoreComponents;
  evidence: string[];
  unknowns: string[];
  reasoning: string;
  positiveSignals: string[];
  negativeSignals: string[];
};

const HIGH_VALUE_CATEGORY_TERMS = [
  "dentist", "dental", "fisioterap", "physiotherap", "spa", "beauty salon",
  "centro estetico", "lodging", "hotel", "agriturism", "bed and breakfast",
  "real estate", "immobiliar", "wedding", "event venue", "veterinar",
  "lawyer", "avvocat", "interior design", "car dealer", "concessionari", "poliambulator",
];

const MEDIUM_VALUE_CATEGORY_TERMS = [
  "restaurant", "ristorant", "trattoria", "gym", "fitness", "personal trainer",
  "hair salon", "parrucchier", "nutrition", "school", "scuola", "course", "formazione",
];

const BOOKING_CATEGORY_TERMS = [
  "dentist", "dental", "fisioterap", "physiotherap", "spa", "beauty", "estet",
  "lodging", "hotel", "agriturism", "bed and breakfast", "restaurant", "ristorant",
  "wedding", "event venue", "veterinar", "gym", "fitness", "hair salon", "parrucchier",
  "nutrition", "nolegg", "rent", "tour", "turism", "medic", "clinic", "professionist",
];

const AUTOMATION_CATEGORY_TERMS = [
  "hotel", "lodging", "agriturism", "restaurant", "ristorant", "spa", "beauty", "estet",
  "gym", "fitness", "dentist", "clinic", "medic", "real estate", "immobiliar", "school",
  "formazione", "car dealer", "concessionari", "veterinar", "ecommerce", "e-commerce",
];

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value.includes(term));
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function websiteVerification(input: DeterministicScoreInput): WebsiteVerification {
  if (input.websiteVerification) return input.websiteVerification;
  if (input.websiteUrl?.trim()) return "verified_present";
  if (input.source === "google_places" || input.googlePlaceId) return "not_detected";
  return "unknown";
}

function weightedOfferScore(components: ScoreComponents, digitalGap: number) {
  return clamp(
    components.businessViability * 0.4
    + components.contactability * 0.2
    + components.commercialSafety * 0.2
    + digitalGap * 0.2,
  );
}

export function gradeForScore(score: number): ScoreGrade {
  if (score >= 80) return "priority";
  if (score >= 65) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

function calculateComponents(input: DeterministicScoreInput, category: string, websiteState: WebsiteVerification): ScoreComponents {
  const reviewCount = Math.max(0, input.reviewCount ?? 0);
  const rating = input.rating ?? null;
  const isHighValue = includesAny(category, HIGH_VALUE_CATEGORY_TERMS);
  const isMediumValue = includesAny(category, MEDIUM_VALUE_CATEGORY_TERMS);

  let businessViability = input.businessStatus === "OPERATIONAL" ? 10 : input.businessStatus === "CLOSED_TEMPORARILY" ? 2 : input.businessStatus === "CLOSED_PERMANENTLY" ? 0 : 5;
  businessViability += isHighValue ? 25 : isMediumValue ? 18 : category ? 10 : 5;
  businessViability += reviewCount >= 200 ? 45 : reviewCount >= 50 ? 38 : reviewCount >= 15 ? 28 : reviewCount >= 5 ? 18 : reviewCount > 0 ? 8 : 5;
  businessViability += rating == null ? 0 : rating >= 4.4 ? 20 : rating >= 4 ? 15 : rating >= 3.5 ? 8 : 0;
  if (input.businessStatus === "CLOSED_TEMPORARILY") businessViability = Math.min(businessViability, 25);
  if (input.businessStatus === "CLOSED_PERMANENTLY") businessViability = 0;

  const contactability = (input.phone?.trim() ? 55 : 0) + (input.email?.trim() ? 45 : 0);

  let commercialSafety = input.businessStatus === "OPERATIONAL" ? 30 : input.businessStatus === "CLOSED_TEMPORARILY" ? 5 : input.businessStatus === "CLOSED_PERMANENTLY" ? 0 : 15;
  commercialSafety += rating == null ? 10 : rating >= 4 ? 25 : rating >= 3.5 ? 15 : 3;
  commercialSafety += websiteState === "verified_present" ? 25 : websiteState === "not_detected" ? 15 : 5;
  commercialSafety += contactability === 100 ? 20 : contactability > 0 ? 12 : 3;
  if (input.businessStatus === "CLOSED_PERMANENTLY") commercialSafety = 0;

  const reputationAvailable = input.rating != null && input.reviewCount != null;
  const officialSourceAvailable = websiteState === "verified_present";
  const digitalEvidenceCompleteness =
    (input.businessStatus ? 20 : 0)
    + (reputationAvailable ? 15 : 0)
    + (websiteState !== "unknown" ? 25 : 0)
    + (contactability > 0 ? 15 : 0)
    + (input.digitalAnalysis?.completed ? 20 : 0)
    + (officialSourceAvailable ? 5 : 0);

  return {
    businessViability: clamp(businessViability),
    contactability: clamp(contactability),
    commercialSafety: clamp(commercialSafety),
    digitalEvidenceCompleteness: clamp(digitalEvidenceCompleteness),
  };
}

function scoreSiteNew(input: DeterministicScoreInput, components: ScoreComponents, websiteState: WebsiteVerification): OfferScore {
  if (input.businessStatus === "CLOSED_PERMANENTLY") return 0;
  if (websiteState === "unknown") return null;
  if (websiteState === "verified_present") return 0;

  let score = weightedOfferScore(components, 100);
  if (components.businessViability < 35) score = Math.min(score, 45);
  if (components.contactability < 30) score = Math.min(score, 55);
  if (input.businessStatus === "CLOSED_TEMPORARILY") score = Math.min(score, 35);
  return score;
}

function scoreWebsiteRedesign(input: DeterministicScoreInput, components: ScoreComponents, websiteState: WebsiteVerification): OfferScore {
  if (input.businessStatus === "CLOSED_PERMANENTLY") return 0;
  if (websiteState === "unknown") return null;
  if (websiteState === "not_detected") return 0;
  if (!input.digitalAnalysis?.completed || input.digitalAnalysis.websiteWeakness == null) return null;
  if (input.digitalAnalysis.websiteWeakness < 25) return 0;

  let score = weightedOfferScore(components, input.digitalAnalysis.websiteWeakness);
  if (components.businessViability < 35) score = Math.min(score, 45);
  if (input.businessStatus === "CLOSED_TEMPORARILY") score = Math.min(score, 35);
  return score;
}

function scoreBooking(input: DeterministicScoreInput, category: string, components: ScoreComponents, websiteState: WebsiteVerification): OfferScore {
  if (input.businessStatus === "CLOSED_PERMANENTLY") return 0;
  if (!includesAny(category, BOOKING_CATEGORY_TERMS)) return 0;
  if (websiteState === "unknown" || typeof input.hasBooking !== "boolean") return null;
  if (input.hasBooking) return 0;

  let score = weightedOfferScore(components, websiteState === "verified_present" ? 90 : 75);
  if (components.businessViability < 35) score = Math.min(score, 45);
  if (components.contactability < 30) score = Math.min(score, 55);
  if (input.businessStatus === "CLOSED_TEMPORARILY") score = Math.min(score, 35);
  return score;
}

function scoreAutomation(input: DeterministicScoreInput, category: string, components: ScoreComponents, websiteState: WebsiteVerification): OfferScore {
  if (input.businessStatus === "CLOSED_PERMANENTLY") return 0;
  if (components.businessViability < 60) return 0;
  if (!includesAny(category, AUTOMATION_CATEGORY_TERMS)) return 0;
  if (websiteState !== "verified_present") return 0;
  if (!input.digitalAnalysis?.completed || input.digitalAnalysis.automationPotential == null) return null;
  if (input.digitalAnalysis.automationPotential < 25) return 0;

  let score = weightedOfferScore(components, input.digitalAnalysis.automationPotential);
  if (input.businessStatus === "CLOSED_TEMPORARILY") score = Math.min(score, 35);
  return score;
}

function recommendation(offerScores: OfferScores) {
  const offers: Array<[RecommendedService, number | null]> = [
    ["sito-nuovo", offerScores.siteNew],
    ["restyling-sito", offerScores.websiteRedesign],
    ["booking-conversione", offerScores.booking],
    ["automazioni", offerScores.automation],
  ];
  const eligible = offers.filter((entry): entry is [RecommendedService, number] => entry[1] !== null && entry[1] > 0);
  eligible.sort((a, b) => b[1] - a[1]);
  return eligible[0] ?? null;
}

function decideNextAction(score: number, confidence: number, contactability: number, service: RecommendedService | null, websiteState: WebsiteVerification): NextAction {
  if (score < 40 || !service) return "ignore";
  if (confidence < 60) return "enrich_data";
  if (confidence < 75) return "manual_verify";
  if (contactability < 35) return "manual_verify";
  if (service === "sito-nuovo" && websiteState === "not_detected") return "manual_verify";
  return "contact_now";
}

function collectSignals(input: DeterministicScoreInput, category: string, websiteState: WebsiteVerification, components: ScoreComponents) {
  const evidence: string[] = [];
  const unknowns: string[] = [];

  if (input.businessStatus === "OPERATIONAL") evidence.push("business_operational");
  else if (input.businessStatus === "CLOSED_TEMPORARILY") evidence.push("business_closed_temporarily");
  else if (input.businessStatus === "CLOSED_PERMANENTLY") evidence.push("business_closed_permanently");
  else unknowns.push("business_status_unknown");

  if (input.rating != null && input.reviewCount != null) {
    evidence.push(components.businessViability >= 70 ? "reputation_strong" : components.businessViability >= 45 ? "reputation_present" : "reputation_weak");
  } else unknowns.push("reputation_unknown");

  if (websiteState === "verified_present") evidence.push("website_verified_present");
  else if (websiteState === "not_detected") {
    evidence.push("website_not_detected");
    unknowns.push("website_absence_unconfirmed");
  } else unknowns.push("website_presence_unknown");

  if (input.phone?.trim()) evidence.push("phone_available"); else unknowns.push("phone_missing");
  if (input.email?.trim()) evidence.push("email_available"); else unknowns.push("email_missing");
  if (!category) unknowns.push("category_missing");
  if (!input.digitalAnalysis?.completed) unknowns.push("digital_analysis_missing");

  return { evidence, unknowns };
}

export function scoreLead(input: DeterministicScoreInput): DeterministicScoreResult {
  const category = normalize(input.category);
  const websiteState = websiteVerification(input);
  const components = calculateComponents(input, category, websiteState);
  const offerScores: OfferScores = {
    siteNew: scoreSiteNew(input, components, websiteState),
    websiteRedesign: scoreWebsiteRedesign(input, components, websiteState),
    booking: scoreBooking(input, category, components, websiteState),
    automation: scoreAutomation(input, category, components, websiteState),
    ads: null,
    branding: null,
  };
  const best = recommendation(offerScores);
  let opportunityScore = best?.[1] ?? 0;
  if (input.businessStatus === "CLOSED_TEMPORARILY") opportunityScore = Math.min(opportunityScore, 35);
  if (input.businessStatus === "CLOSED_PERMANENTLY") opportunityScore = 0;
  const recommendedService = opportunityScore > 0 ? best?.[0] ?? null : null;
  const confidence = components.digitalEvidenceCompleteness;
  const nextAction = decideNextAction(opportunityScore, confidence, components.contactability, recommendedService, websiteState);
  const { evidence, unknowns } = collectSignals(input, category, websiteState, components);
  const reasoning = recommendedService
    ? `Opportunita ${opportunityScore}/100 per ${recommendedService}; prossima azione: ${nextAction}.`
    : `Nessuna offerta valutabile con priorita sufficiente; prossima azione: ${nextAction}.`;

  return {
    version: DETERMINISTIC_SCORE_VERSION,
    score: opportunityScore,
    opportunityScore,
    confidence,
    grade: gradeForScore(opportunityScore),
    recommendedService,
    nextAction,
    offerScores,
    components,
    evidence,
    unknowns,
    reasoning,
    positiveSignals: evidence,
    negativeSignals: unknowns,
  };
}
