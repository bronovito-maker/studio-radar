export const DETERMINISTIC_SCORE_VERSION = "deterministic-v2026.06.28-2";

export type DeterministicScoreInput = {
  businessName: string;
  region?: string | null;
  category?: string | null;
  phone?: string | null;
  email?: string | null;
  websiteUrl?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  hasBooking?: boolean;
  businessStatus?: "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY" | null;
};

export type ScoreGrade = "cold" | "warm" | "hot" | "priority";
export type RecommendedService = "sito-nuovo" | "restyling-sito" | "booking-conversione" | "automazioni";

export type ScoreComponent = {
  key: "marketFit" | "businessStrength" | "digitalOpportunity" | "contactability";
  label: string;
  score: number;
  maxScore: number;
};

export type DeterministicScoreResult = {
  score: number;
  grade: ScoreGrade;
  recommendedService: RecommendedService;
  reasoning: string;
  positiveSignals: string[];
  negativeSignals: string[];
  components: ScoreComponent[];
  confidence: number;
  version: string;
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
  "wedding", "event venue", "veterinar", "gym", "fitness", "hair salon", "parrucchier", "nutrition",
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

export function gradeForScore(score: number): ScoreGrade {
  if (score >= 80) return "priority";
  if (score >= 65) return "hot";
  if (score >= 45) return "warm";
  return "cold";
}

export function scoreLead(input: DeterministicScoreInput): DeterministicScoreResult {
  const category = normalize(input.category);
  const region = normalize(input.region);
  const hasWebsite = Boolean(input.websiteUrl?.trim());
  const bookingRelevant = includesAny(category, BOOKING_CATEGORY_TERMS);
  const positiveSignals: string[] = [];
  const negativeSignals: string[] = [];

  if (input.businessStatus === "CLOSED_PERMANENTLY") {
    return {
      score: 0,
      grade: "cold",
      recommendedService: hasWebsite ? "restyling-sito" : "sito-nuovo",
      reasoning: "L'attivita risulta chiusa definitivamente e viene esclusa dalla priorita commerciale.",
      positiveSignals: [],
      negativeSignals: ["business_closed_permanently"],
      components: [
        { key: "marketFit", label: "Coerenza mercato", score: 0, maxScore: 30 },
        { key: "businessStrength", label: "Solidita attivita", score: 0, maxScore: 25 },
        { key: "digitalOpportunity", label: "Opportunita digitale", score: 0, maxScore: 30 },
        { key: "contactability", label: "Contattabilita", score: 0, maxScore: 15 },
      ],
      confidence: 0.95,
      version: DETERMINISTIC_SCORE_VERSION,
    };
  }

  let marketFit = 0;
  if (includesAny(category, HIGH_VALUE_CATEGORY_TERMS)) {
    marketFit += 22;
    positiveSignals.push("category_high_value");
  } else if (includesAny(category, MEDIUM_VALUE_CATEGORY_TERMS)) {
    marketFit += 16;
    positiveSignals.push("category_medium_value");
  } else if (category) {
    marketFit += 8;
    negativeSignals.push("category_unvalidated");
  } else {
    marketFit += 5;
    negativeSignals.push("category_missing");
  }
  if (region === "emilia romagna") {
    marketFit += 8;
    positiveSignals.push("region_emilia_romagna");
  } else if (region === "toscana") {
    marketFit += 6;
    positiveSignals.push("region_toscana");
  } else if (region === "lombardia") {
    marketFit += 3;
    positiveSignals.push("region_lombardia");
  } else {
    negativeSignals.push("region_outside_priority");
  }

  let businessStrength = input.businessStatus === "OPERATIONAL" ? 5 : 3;
  if (input.businessStatus === "OPERATIONAL") positiveSignals.push("business_operational");
  const rating = input.rating ?? 0;
  const reviewCount = input.reviewCount ?? 0;
  if (rating >= 4.2 && reviewCount >= 30) {
    businessStrength += 20;
    positiveSignals.push("reputation_strong");
  } else if (rating >= 4 && reviewCount >= 10) {
    businessStrength += 15;
    positiveSignals.push("reputation_good");
  } else if (reviewCount >= 5 && rating >= 3.5) {
    businessStrength += 8;
    positiveSignals.push("reputation_present");
  } else if (rating > 0 && rating < 3.5) {
    businessStrength += 3;
    negativeSignals.push("rating_low");
  } else {
    businessStrength += 2;
    negativeSignals.push("reputation_insufficient");
  }
  if (input.businessStatus === "CLOSED_TEMPORARILY") {
    businessStrength = 0;
    negativeSignals.push("business_closed_temporarily");
  }

  let digitalOpportunity = hasWebsite ? 8 : 20;
  positiveSignals.push(hasWebsite ? "website_present_unassessed" : "website_missing");
  if (bookingRelevant) {
    if (input.hasBooking === false) {
      digitalOpportunity += 10;
      positiveSignals.push("booking_opportunity");
    } else if (input.hasBooking === true) {
      digitalOpportunity += 2;
      negativeSignals.push("booking_already_present");
    } else {
      digitalOpportunity += 4;
      negativeSignals.push("booking_unknown");
    }
  } else {
    digitalOpportunity += 6;
  }

  let contactability = 0;
  if (input.phone?.trim()) {
    contactability += 8;
    positiveSignals.push("phone_available");
  } else {
    negativeSignals.push("phone_missing");
  }
  if (input.email?.trim()) {
    contactability += 7;
    positiveSignals.push("email_available");
  } else {
    negativeSignals.push("email_missing");
  }

  const components: ScoreComponent[] = [
    { key: "marketFit", label: "Coerenza mercato", score: Math.min(30, marketFit), maxScore: 30 },
    { key: "businessStrength", label: "Solidita attivita", score: Math.min(25, businessStrength), maxScore: 25 },
    { key: "digitalOpportunity", label: "Opportunita digitale", score: Math.min(30, digitalOpportunity), maxScore: 30 },
    { key: "contactability", label: "Contattabilita", score: Math.min(15, contactability), maxScore: 15 },
  ];
  let score = components.reduce((total, component) => total + component.score, 0);
  if (input.businessStatus === "CLOSED_TEMPORARILY") score = Math.min(score, 35);

  const strongest = [...components].sort(
    (a, b) => (b.score / b.maxScore) - (a.score / a.maxScore),
  ).slice(0, 2);
  const reasoning = `Score basato soprattutto su ${strongest.map((component) => component.label.toLowerCase()).join(" e ")}.`;
  const knownFields = [
    Boolean(category),
    Boolean(region),
    input.websiteUrl !== undefined,
    Boolean(input.phone?.trim()) || Boolean(input.email?.trim()),
    input.rating != null,
    input.reviewCount != null,
    input.businessStatus != null,
    typeof input.hasBooking === "boolean",
  ].filter(Boolean).length;
  const confidence = Number(Math.min(0.95, 0.35 + knownFields * 0.075).toFixed(3));
  const recommendedService: RecommendedService = !hasWebsite
    ? "sito-nuovo"
    : bookingRelevant && input.hasBooking === false
      ? "booking-conversione"
      : "restyling-sito";

  return {
    score,
    grade: gradeForScore(score),
    recommendedService,
    reasoning,
    positiveSignals,
    negativeSignals,
    components,
    confidence,
    version: DETERMINISTIC_SCORE_VERSION,
  };
}
