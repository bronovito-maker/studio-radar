-- Configuration and concurrency guard for nightly Places discovery.

alter table public.settings
  add column cron_category text not null default 'Hotel',
  add column cron_location text not null default 'Bologna',
  add column cron_region text not null default 'Emilia-Romagna';

alter table public.settings
  add constraint settings_cron_context_not_empty check (
    length(trim(cron_category)) > 0
    and length(trim(cron_location)) > 1
    and length(trim(cron_region)) > 0
  );

alter table public.lead_candidates
  add column origin text not null default 'manual';

alter table public.lead_candidates
  add constraint lead_candidates_origin_check check (origin in ('manual', 'cron'));

create unique index scan_runs_one_active_cron_idx
  on public.scan_runs ((trigger))
  where trigger = 'cron' and status = 'running';
