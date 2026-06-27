export const DETERMINISTIC_SCORE_VERSION = "deterministic-v2026.06.27-1";

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

export type DeterministicScoreResult = {
  score: number;
  grade: ScoreGrade;
  recommendedService: "sito-nuovo" | "restyling-sito" | "booking-conversione" | "automazioni";
  reasoning: string;
  positiveSignals: string[];
  negativeSignals: string[];
  confidence: number;
  version: string;
};

type WeightedSignal = {
  key: string;
  points: number;
  description: string;
};

const HIGH_VALUE_CATEGORY_TERMS = [
  "dentist",
  "dental",
  "fisioterap",
  "physiotherap",
  "spa",
  "beauty salon",
  "centro estetico",
  "lodging",
  "hotel",
  "agriturism",
  "bed and breakfast",
  "real estate",
  "immobiliar",
  "wedding",
  "event venue",
  "veterinar",
  "lawyer",
  "avvocat",
  "interior design",
  "car dealer",
  "concessionari",
  "poliambulator",
];

const MEDIUM_VALUE_CATEGORY_TERMS = [
  "restaurant",
  "ristorant",
  "trattoria",
  "gym",
  "fitness",
  "personal trainer",
  "hair salon",
  "parrucchier",
  "nutrition",
  "school",
  "scuola",
  "course",
  "formazione",
];

const BOOKING_CATEGORY_TERMS = [
  "dentist",
  "dental",
  "fisioterap",
  "physiotherap",
  "spa",
  "beauty",
  "estet",
  "lodging",
  "hotel",
  "agriturism",
  "bed and breakfast",
  "restaurant",
  "ristorant",
  "wedding",
  "event venue",
  "veterinar",
  "gym",
  "fitness",
  "hair salon",
  "parrucchier",
  "nutrition",
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

function gradeFor(score: number): ScoreGrade {
  if (score >= 80) return "priority";
  if (score >= 60) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

export function scoreLead(input: DeterministicScoreInput): DeterministicScoreResult {
  if (input.businessStatus === "CLOSED_PERMANENTLY") {
    return {
      score: 0,
      grade: "cold",
      recommendedService: input.websiteUrl ? "restyling-sito" : "sito-nuovo",
      reasoning: "L'attività risulta chiusa definitivamente e non deve essere prioritizzata.",
      positiveSignals: [],
      negativeSignals: ["business_closed_permanently"],
      confidence: 0.95,
      version: DETERMINISTIC_SCORE_VERSION,
    };
  }

  const category = normalize(input.category);
  const region = normalize(input.region);
  const hasWebsite = Boolean(input.websiteUrl?.trim());
  const bookingRelevant = includesAny(category, BOOKING_CATEGORY_TERMS);
  const signals: WeightedSignal[] = [
    { key: "base_business", points: 15, description: "attività potenzialmente lavorabile" },
  ];

  if (includesAny(category, HIGH_VALUE_CATEGORY_TERMS)) {
    signals.push({ key: "category_high_value", points: 16, description: "categoria ad alto valore" });
  } else if (includesAny(category, MEDIUM_VALUE_CATEGORY_TERMS)) {
    signals.push({ key: "category_medium_value", points: 10, description: "categoria coerente con i servizi" });
  } else if (!category) {
    signals.push({ key: "category_missing", points: -5, description: "categoria non disponibile" });
  }

  if (region === "emilia romagna") {
    signals.push({ key: "region_emilia_romagna", points: 12, description: "area prioritaria Emilia-Romagna" });
  } else if (region === "toscana") {
    signals.push({ key: "region_toscana", points: 8, description: "area prioritaria Toscana" });
  } else if (region === "lombardia") {
    signals.push({ key: "region_lombardia", points: 3, description: "area target Lombardia" });
  }

  signals.push(
    hasWebsite
      ? { key: "website_present", points: 4, description: "presenza digitale già attiva" }
      : { key: "website_missing", points: 18, description: "sito web assente" },
  );

  const rating = input.rating ?? 0;
  const reviewCount = input.reviewCount ?? 0;
  if (rating >= 4.2 && reviewCount >= 30) {
    signals.push({ key: "reputation_strong", points: 16, description: "reputazione locale solida" });
  } else if (rating >= 4 && reviewCount >= 10) {
    signals.push({ key: "reputation_good", points: 10, description: "buone recensioni e attività reale" });
  } else if (reviewCount >= 5) {
    signals.push({ key: "reputation_present", points: 4, description: "presenza locale verificabile" });
  } else if (reviewCount === 0) {
    signals.push({ key: "reputation_missing", points: -6, description: "nessuna recensione disponibile" });
  }
  if (rating > 0 && rating < 3.5) {
    signals.push({ key: "rating_low", points: -10, description: "rating sotto 3,5" });
  }

  if (input.phone?.trim()) {
    signals.push({ key: "phone_available", points: 6, description: "telefono disponibile" });
  } else {
    signals.push({ key: "phone_missing", points: -5, description: "telefono non disponibile" });
  }
  if (input.email?.trim()) {
    signals.push({ key: "email_available", points: 3, description: "email disponibile" });
  }
  if (bookingRelevant && input.hasBooking === false) {
    signals.push({ key: "booking_opportunity", points: 7, description: "opportunità booking o conversione" });
  }
  if (input.businessStatus === "CLOSED_TEMPORARILY") {
    signals.push({ key: "business_closed_temporarily", points: -20, description: "attività temporaneamente chiusa" });
  }

  const score = Math.max(0, Math.min(100, signals.reduce((total, signal) => total + signal.points, 0)));
  const positives = signals.filter((signal) => signal.points > 0 && signal.key !== "base_business");
  const negatives = signals.filter((signal) => signal.points < 0);
  const topReasons = [...positives].sort((a, b) => b.points - a.points).slice(0, 3);
  const reasoning = topReasons.length
    ? `Priorità basata su ${topReasons.map((signal) => signal.description).join(", ")}.`
    : "I dati disponibili non mostrano ancora segnali sufficienti per assegnare priorità.";

  const knownFields = [
    Boolean(category),
    Boolean(region),
    Boolean(input.phone?.trim()),
    input.rating != null,
    input.reviewCount != null,
    input.businessStatus != null,
  ].filter(Boolean).length;
  const confidence = Math.min(0.95, Number((0.45 + knownFields * 0.075).toFixed(3)));
  const recommendedService = !hasWebsite
    ? "sito-nuovo"
    : bookingRelevant && input.hasBooking === false
      ? "booking-conversione"
      : "restyling-sito";

  return {
    score,
    grade: gradeFor(score),
    recommendedService,
    reasoning,
    positiveSignals: positives.map((signal) => signal.key),
    negativeSignals: negatives.map((signal) => signal.key),
    confidence,
    version: DETERMINISTIC_SCORE_VERSION,
  };
}
