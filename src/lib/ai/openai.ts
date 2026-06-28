import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import {
  normalizeWebsiteEvidence,
  WEBSITE_ASSESSMENT_VERSION,
  websiteAssessmentSchema,
  type WebsiteEvidence,
} from "@/lib/ai/contracts";

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
