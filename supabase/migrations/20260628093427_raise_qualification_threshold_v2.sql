-- Align automatic qualification with deterministic scoring v2.
-- Preserve any threshold already customized by the team.

update public.settings
set default_score_threshold = 65
where id = 1 and default_score_threshold = 50;
