import type { WebsiteAssessment } from "@/lib/ai/contracts";
import {
  gradeForScore,
  type DeterministicScoreResult,
  type RecommendedService,
  type ScoreGrade,
} from "./deterministic";

export const HYBRID_SCORE_VERSION = "hybrid-v2026.06.28-1";

export type HybridScoreResult = {
  score: number;
  grade: ScoreGrade;
  deterministicScore: number;
  aiScore: number | null;
  aiWeight: number;
  recommendedService: RecommendedService | WebsiteAssessment["recommendedService"];
  confidence: number;
  reasoning: string;
  version: string;
};

export function combineScores(
  deterministic: DeterministicScoreResult,
  assessment?: WebsiteAssessment | null,
): HybridScoreResult {
  const hasUsableAi = Boolean(
    assessment
    && assessment.confidence >= 0.6
    && assessment.opportunities.some((opportunity) => opportunity.evidence.trim().length >= 8),
  );
  if (!assessment || !hasUsableAi) {
    return {
      score: deterministic.score,
      grade: deterministic.grade,
      deterministicScore: deterministic.score,
      aiScore: assessment?.advisoryScore ?? null,
      aiWeight: 0,
      recommendedService: deterministic.recommendedService,
      confidence: deterministic.confidence,
      reasoning: assessment
        ? `${deterministic.reasoning} Analisi AI esclusa per confidenza o evidenze insufficienti.`
        : deterministic.reasoning,
      version: HYBRID_SCORE_VERSION,
    };
  }

  const aiWeight = Number((0.3 + assessment.confidence * 0.15).toFixed(3));
  const score = Math.round(
    deterministic.score * (1 - aiWeight) + assessment.advisoryScore * aiWeight,
  );
  const recommendedService = assessment.confidence >= 0.7
    ? assessment.recommendedService
    : deterministic.recommendedService;
  const confidence = Number((
    deterministic.confidence * (1 - aiWeight) + assessment.confidence * aiWeight
  ).toFixed(3));

  return {
    score,
    grade: gradeForScore(score),
    deterministicScore: deterministic.score,
    aiScore: assessment.advisoryScore,
    aiWeight,
    recommendedService,
    confidence,
    reasoning: `${deterministic.reasoning} OpenAI ha contribuito per ${Math.round(aiWeight * 100)}% usando evidenze del sito ufficiale.`,
    version: HYBRID_SCORE_VERSION,
  };
}
