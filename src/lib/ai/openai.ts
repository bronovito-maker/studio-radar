import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  candidateEnrichmentSchema,
  CANDIDATE_ENRICHMENT_VERSION,
  normalizeWebsiteEvidence,
  OUTREACH_DRAFT_VERSION,
  outreachDraftSchema,
  WEBSITE_ASSESSMENT_VERSION,
  websiteAssessmentSchema,
  type WebsiteAssessment,
  type WebsiteDomainInput,
  type WebsiteEvidence,
} from "@/lib/ai/contracts";
import { officialWebsiteDomain, sourceBelongsToDomain } from "@/lib/ai/domain";

export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";

export class AiAnalysisError extends Error {
  constructor(public readonly code: "NOT_CONFIGURED" | "INVALID_OUTPUT" | "REQUEST_FAILED") {
    super(code);
    this.name = "AiAnalysisError";
  }
}

export function isOpenAiConfigured() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function validateAssessmentSources(assessment: WebsiteAssessment, domain: string) {
  const sources = [
    ...assessment.sources,
    ...assessment.opportunities.map((opportunity) => opportunity.sourceUrl),
  ];
  if (!sources.every((source) => sourceBelongsToDomain(source, domain))) {
    throw new AiAnalysisError("INVALID_OUTPUT");
  }
}

export async function analyzeWebsiteWithOpenAi(rawEvidence: WebsiteEvidence) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new AiAnalysisError("NOT_CONFIGURED");

  const evidence = normalizeWebsiteEvidence(rawEvidence);
  const model = process.env.AI_SCORING_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  const client = new OpenAI({ apiKey, timeout: 20_000, maxRetries: 1 });

  try {
    const response = await client.responses.parse({
      model,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 1_800,
      input: [
        {
          role: "system",
          content: [
            "Sei l'analista commerciale di Studio Radar, agenzia italiana di servizi digitali B2B.",
            "Valuta esclusivamente le prove presenti nel testo del sito ufficiale fornito.",
            "Non inventare funzionalita, problemi, risultati, tecnologie, contatti o bisogni.",
            "Lo score AI e consultivo e non sostituisce lo score deterministico del CRM.",
            "Suggerisci opportunita concrete e un angolo outreach professionale, consulenziale e non aggressivo.",
            "Quando una conclusione non e supportata, inseriscila in missingEvidence invece di dedurla.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify(evidence),
        },
      ],
      text: {
        format: zodTextFormat(websiteAssessmentSchema, "website_assessment"),
        verbosity: "low",
      },
    });

    if (!response.output_parsed) throw new AiAnalysisError("INVALID_OUTPUT");
    return {
      assessment: response.output_parsed,
      model,
      promptVersion: WEBSITE_ASSESSMENT_VERSION,
      responseId: response.id,
    };
  } catch (error) {
    if (error instanceof AiAnalysisError) throw error;
    throw new AiAnalysisError("REQUEST_FAILED");
  }
}

export async function analyzeWebsiteDomainWithOpenAi(input: WebsiteDomainInput) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new AiAnalysisError("NOT_CONFIGURED");

  let domain: string;
  try {
    domain = officialWebsiteDomain(input.websiteUrl);
  } catch (error) {
    if (error instanceof AiAnalysisError) throw error;
    throw new AiAnalysisError("INVALID_OUTPUT");
  }

  const model = process.env.AI_SCORING_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  const client = new OpenAI({ apiKey, timeout: 35_000, maxRetries: 1 });

  try {
    const response = await client.responses.parse({
      model,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 2_200,
      tools: [{
        type: "web_search",
        filters: { allowed_domains: [domain] },
        search_context_size: "low",
      }],
      tool_choice: "required",
      input: [
        {
          role: "system",
          content: [
            "Sei l'analista commerciale di Studio Radar, agenzia italiana di servizi digitali B2B.",
            `Consulta esclusivamente il dominio ufficiale ${domain} e le sue sottopagine.`,
            "Non usare directory, social network, mappe, recensioni esterne o conoscenze pregresse.",
            "Non inventare problemi, tecnologie, prestazioni, contatti o bisogni.",
            "Ogni opportunita deve citare una prova osservabile e l'URL esatto della pagina che la supporta.",
            "Lo score misura l'opportunita commerciale per Studio Radar, non la qualita generale dell'azienda.",
            "Inserisci in missingEvidence tutto cio che non puoi verificare.",
            "Suggerisci un approccio professionale, consulenziale e non aggressivo.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            businessName: input.businessName.trim().slice(0, 200),
            category: input.category.trim().slice(0, 200),
            officialWebsite: input.websiteUrl.trim().slice(0, 2048),
          }),
        },
      ],
      text: {
        format: zodTextFormat(websiteAssessmentSchema, "website_assessment"),
        verbosity: "low",
      },
    });

    if (!response.output_parsed) throw new AiAnalysisError("INVALID_OUTPUT");
    validateAssessmentSources(response.output_parsed, domain);
    return {
      assessment: response.output_parsed,
      model,
      promptVersion: WEBSITE_ASSESSMENT_VERSION,
      responseId: response.id,
      domain,
    };
  } catch (error) {
    if (error instanceof AiAnalysisError) throw error;
    throw new AiAnalysisError("REQUEST_FAILED");
  }
}

export async function enrichCandidateFromOfficialWebsite(input: {
  websiteUrl: string;
  searchCategory: string;
  searchLocation: string;
  searchRegion: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new AiAnalysisError("NOT_CONFIGURED");

  let domain: string;
  try {
    domain = officialWebsiteDomain(input.websiteUrl);
  } catch {
    throw new AiAnalysisError("INVALID_OUTPUT");
  }

  const model = process.env.AI_SCORING_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  const client = new OpenAI({ apiKey, timeout: 35_000, maxRetries: 1 });

  try {
    const response = await client.responses.parse({
      model,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 1_800,
      tools: [{
        type: "web_search",
        filters: { allowed_domains: [domain] },
        search_context_size: "low",
      }],
      tool_choice: "required",
      input: [
        {
          role: "system",
          content: [
            "Estrai un profilo aziendale verificabile per il CRM Studio Radar.",
            `Consulta esclusivamente il dominio ufficiale ${domain} e le sue sottopagine.`,
            "Non usare Google Maps, directory, social, recensioni o conoscenze pregresse.",
            "Telefono, email, indirizzo e booking devono essere riportati solo se visibili sul sito ufficiale.",
            "Usa null per ogni dato non verificato e dichiaralo in missingEvidence.",
            "Ogni URL in sources deve appartenere al dominio consentito.",
            "Per ogni campo valorizzato inserisci in fieldSources l'URL esatto della pagina ufficiale che lo prova; usa null quando manca una prova diretta.",
            "La categoria, la localita e la regione di ricerca sono solo contesto: correggile se il sito ufficiale mostra dati diversi.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            officialWebsite: input.websiteUrl,
            searchContext: {
              category: input.searchCategory,
              location: input.searchLocation,
              region: input.searchRegion,
            },
          }),
        },
      ],
      text: {
        format: zodTextFormat(candidateEnrichmentSchema, "candidate_enrichment"),
        verbosity: "low",
      },
    });

    const enrichment = response.output_parsed;
    if (!enrichment || !enrichment.sources.every((source) => sourceBelongsToDomain(source, domain))) {
      throw new AiAnalysisError("INVALID_OUTPUT");
    }
    if (!sourceBelongsToDomain(enrichment.websiteUrl, domain)) {
      throw new AiAnalysisError("INVALID_OUTPUT");
    }
    const fieldSourceValues = Object.values(enrichment.fieldSources).filter((source): source is string => Boolean(source));
    if (!fieldSourceValues.every((source) => sourceBelongsToDomain(source, domain))) {
      throw new AiAnalysisError("INVALID_OUTPUT");
    }

    return {
      enrichment,
      domain,
      model,
      promptVersion: CANDIDATE_ENRICHMENT_VERSION,
      responseId: response.id,
    };
  } catch (error) {
    if (error instanceof AiAnalysisError) throw error;
    throw new AiAnalysisError("REQUEST_FAILED");
  }
}

export async function generateOutreachDraftWithOpenAi(input: {
  businessName: string;
  category: string;
  city: string;
  recommendedService: string;
  evidenceSummary: string;
  opportunities: string[];
  outreachAngle: string;
}) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new AiAnalysisError("NOT_CONFIGURED");

  const model = process.env.AI_SCORING_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
  const client = new OpenAI({ apiKey, timeout: 25_000, maxRetries: 1 });
  try {
    const response = await client.responses.parse({
      model,
      store: false,
      reasoning: { effort: "low" },
      max_output_tokens: 900,
      input: [
        {
          role: "system",
          content: [
            "Scrivi una prima bozza WhatsApp B2B in italiano per Studio Radar.",
            "Il tono deve essere professionale, elegante, consulenziale e umano.",
            "Usa soltanto i fatti forniti. Non inventare problemi, risultati, clienti, urgenze o dettagli tecnici.",
            "Non usare prezzi, emoji, markdown, superlativi, pressione commerciale o formule da spam.",
            "Non dichiarare di aver svolto un audit completo: parla di una prima osservazione.",
            "Mantieni il messaggio tra 350 e 650 caratteri, con saluto, osservazione concreta, proposta di valore e domanda finale semplice.",
            "Non inserire link: il booking link viene aggiunto separatamente dal CRM.",
          ].join(" "),
        },
        { role: "user", content: JSON.stringify(input) },
      ],
      text: {
        format: zodTextFormat(outreachDraftSchema, "outreach_draft"),
        verbosity: "low",
      },
    });

    if (!response.output_parsed) throw new AiAnalysisError("INVALID_OUTPUT");
    return {
      draft: response.output_parsed,
      model,
      promptVersion: OUTREACH_DRAFT_VERSION,
      responseId: response.id,
    };
  } catch (error) {
    if (error instanceof AiAnalysisError) throw error;
    throw new AiAnalysisError("REQUEST_FAILED");
  }
}
