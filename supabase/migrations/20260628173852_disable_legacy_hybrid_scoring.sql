-- Historical hybrid scores remain readable, but new numeric AI scores are forbidden.

revoke execute on function public.save_hybrid_score(
  uuid,
  integer,
  public.score_grade,
  integer,
  integer,
  text,
  text[],
  text[],
  numeric,
  text,
  text,
  jsonb,
  text
)
from authenticated;
