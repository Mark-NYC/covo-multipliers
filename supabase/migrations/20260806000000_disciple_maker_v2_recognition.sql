-- =============================================================================
-- Disciple Maker Next Step — V2 (recognition-first)
-- =============================================================================
-- Additive only. No drops: legacy V1 columns (dimension_scores, pathway,
-- strongest_dimension, lowest_dimension) are left in place so historical rows
-- stay readable. V2 stops writing them.
--
-- New model: a short behavioral flow routes to one of six "recognition"
-- outcomes. Answers live in diagnostic_answers (jsonb, already exists).
-- =============================================================================

alter table public.disciple_maker_sessions
  -- diagnostic_answers was introduced by 20260629130000; re-declared here with
  -- IF NOT EXISTS so this migration is self-healing on databases that never
  -- received that earlier migration (as happened in production).
  add column if not exists diagnostic_answers     jsonb,
  add column if not exists recognition_outcome    text,     -- e.g. 'learning_not_practicing'
  add column if not exists barrier_summary         text,    -- short human sentence
  add column if not exists seven_day_step          text,    -- the prescribed action
  add column if not exists note                    text,    -- optional user free-text
  add column if not exists step_accepted           boolean not null default false,
  add column if not exists human_connection_used   boolean not null default false,
  add column if not exists share_action_used       boolean not null default false,
  add column if not exists covo_cta_clicked        boolean not null default false,
  add column if not exists assessment_version      text default 'v2';

create index if not exists disciple_maker_sessions_recognition_outcome_idx
  on public.disciple_maker_sessions (recognition_outcome);


-- ---------------------------------------------------------------------------
-- disciple_maker_events — lightweight funnel log (landing → completion → CTA).
-- One row per tracked interaction. Powers the admin funnel + abandonment view.
-- ---------------------------------------------------------------------------
create table if not exists public.disciple_maker_events (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references public.disciple_maker_sessions(id) on delete cascade,
  event       text not null,   -- 'started','question_answered','recognition_confirmed',
                               --  'completed','results_viewed','step_accepted','human_named',
                               --  'share_opened','cta_clicked'
  detail      jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists disciple_maker_events_session_idx
  on public.disciple_maker_events (session_id);
create index if not exists disciple_maker_events_event_idx
  on public.disciple_maker_events (event, created_at);
