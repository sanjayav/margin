-- Underline · Neon Postgres schema
-- Official emissions data, normalized and aggregated to the level the engine consumes.
-- Each refresh writes a new immutable dataset_version; data_sources.current_version
-- points at the live one, so swaps are atomic and results are reproducible/auditable.

create table if not exists data_sources (
  market          text primary key,           -- 'EU' | 'IN' | 'AU' | 'UK'
  name            text not null,              -- human source name
  url             text,                       -- where it came from
  licence         text,
  current_version bigint,                     -- active dataset_version in vehicles
  last_refreshed  timestamptz,
  status          text default 'idle'
);

create table if not exists refresh_runs (
  id              bigserial primary key,
  market          text not null,
  dataset_version bigint not null,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  rows_in         integer,                    -- raw source rows read
  rows_out        integer,                    -- aggregated rows written
  status          text,                       -- 'ok' | 'error'
  message         text
);

create table if not exists vehicles (
  id              bigserial primary key,
  market          text not null,
  dataset_version bigint not null,
  parent          text not null,             -- compliance parent (the maker)
  pool            text,
  brand           text,
  make            text,
  model           text not null,
  year            integer not null,
  powertrain      text,                       -- BEV/PHEV/HEV/MHEV/ICE/...
  fuel            text,
  co2             double precision,           -- g CO2/km (tailpipe, official)
  mass            double precision,           -- kg
  sales           integer not null,           -- registrations
  vclass          text,
  eco_benefit     double precision,
  cnf             double precision,
  zev             integer,
  engine_cc       double precision,
  -- richer per-variant spec (optional; present for the bundled EU extract)
  variant         text,
  variant_id      text,
  battery         double precision,
  range_km        double precision,
  energy          double precision,
  kerb_mass       double precision,
  test_mass       double precision,
  footprint       double precision,
  gearbox         text,
  driveline       text,
  market_label    text          -- variant's sub-market label (distinct from `market` country code)
);

create index if not exists vehicles_market_version_idx on vehicles (market, dataset_version);
create index if not exists vehicles_market_year_idx on vehicles (market, year);

-- Durable store for the analyst's saved scenarios and the active per-country
-- assumption set, so edits survive reloads and follow the user across devices.
-- One row per workspace (single demo login today; keyed for multi-tenant later).
create table if not exists scenario_store (
  workspace   text primary key,
  scenarios   jsonb not null default '[]'::jsonb,   -- named, durable scenarios
  assumptions jsonb not null default '{}'::jsonb,   -- live working set, keyed by market
  updated_at  timestamptz not null default now()
);

-- ── Multi-tenancy ─────────────────────────────────────────────────────────
-- A customer's imported dataset must not become every customer's dataset. Both
-- data tables are scoped by workspace, where the empty string is the SHARED
-- baseline (the official extract / EEA refresh) that every workspace sees until
-- it imports its own. Reads prefer the workspace overlay and fall back to shared.
--
-- Idempotent: safe to re-run on an existing database.
alter table data_sources add column if not exists workspace text not null default '';
alter table vehicles     add column if not exists workspace text not null default '';

-- data_sources was keyed on market alone, which is what made an import global.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'data_sources_pkey'
      and (select count(*) from unnest(conkey)) = 1
  ) then
    alter table data_sources drop constraint data_sources_pkey;
    alter table data_sources add primary key (market, workspace);
  end if;
end $$;

create index if not exists vehicles_ws_market_version_idx on vehicles (workspace, market, dataset_version);
