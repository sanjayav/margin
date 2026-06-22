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
  engine_cc       double precision
);

create index if not exists vehicles_market_version_idx on vehicles (market, dataset_version);
create index if not exists vehicles_market_year_idx on vehicles (market, year);
