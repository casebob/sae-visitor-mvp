-- Run this in Supabase SQL editor
create extension if not exists pgcrypto;

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  student_number text not null unique check (student_number ~ '^[0-9]{7}$'),
  resident_name text not null,
  email text not null,
  created_at timestamptz default now()
);

create table if not exists visitors (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  created_at timestamptz default now()
);

create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete restrict,
  visitor_id uuid not null references visitors(id) on delete restrict,
  entry_at timestamptz not null,
  exit_at timestamptz not null,
  auto_overnight boolean not null default true,
  status text not null check (status in ('pending','approved','declined','checked_in','checked_out','archived')) default 'pending',
  flags jsonb not null default '{}'::jsonb,
  created_ip inet,
  created_at timestamptz default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id) on delete cascade,
  doc_type text not null check (doc_type in ('visitor_photo','id_front')),
  storage_key text not null,
  mime text not null,
  size_bytes int not null,
  sha256 bytea,
  created_at timestamptz default now()
);

-- Minimal RLS: off for MVP. Enable later when admin UI is ready.
alter table students enable row level security;
alter table visitors enable row level security;
alter table visits enable row level security;
alter table documents enable row level security;

-- Simple policies: allow inserts from service role only (the serverless function uses service role).
create policy allow_service_inserts_students on students for insert to authenticated with check (true);
create policy allow_service_inserts_visitors on visitors for insert to authenticated with check (true);
create policy allow_service_inserts_visits on visits for insert to authenticated with check (true);
create policy allow_service_inserts_documents on documents for insert to authenticated with check (true);
