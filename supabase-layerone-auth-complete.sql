-- LayerOne MVP: schema completo para Supabase Auth + trial + estoque por usuario.
-- Rode este arquivo no SQL Editor do Supabase.
-- Ele cria as tabelas necessarias e fecha o acesso para cada usuario ver apenas os proprios dados.

create table if not exists public.layerone_filaments (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  brand text not null,
  supplier text,
  type text not null,
  color_name text not null,
  color_hex text not null,
  initial_weight numeric not null default 0,
  current_weight numeric not null default 0,
  roll_cost numeric not null default 0,
  avg_cost_per_gram numeric not null default 0,
  stock_value numeric not null default 0,
  min_alert numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.layerone_filaments
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

create table if not exists public.layerone_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  plan_status text not null default 'trial',
  trial_started_at timestamptz not null default now(),
  trial_expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.layerone_filaments enable row level security;
alter table public.layerone_profiles enable row level security;

drop policy if exists "LayerOne anon read filaments" on public.layerone_filaments;
drop policy if exists "LayerOne anon insert filaments" on public.layerone_filaments;
drop policy if exists "LayerOne anon update filaments" on public.layerone_filaments;
drop policy if exists "LayerOne anon delete filaments" on public.layerone_filaments;
drop policy if exists "LayerOne authenticated read own filaments" on public.layerone_filaments;
drop policy if exists "LayerOne authenticated insert own filaments" on public.layerone_filaments;
drop policy if exists "LayerOne authenticated update own filaments" on public.layerone_filaments;
drop policy if exists "LayerOne authenticated delete own filaments" on public.layerone_filaments;
drop policy if exists "LayerOne authenticated read own profile" on public.layerone_profiles;
drop policy if exists "LayerOne authenticated insert own profile" on public.layerone_profiles;
drop policy if exists "LayerOne authenticated update own profile" on public.layerone_profiles;

create policy "LayerOne authenticated read own filaments"
on public.layerone_filaments
for select
to authenticated
using (auth.uid() = user_id);

create policy "LayerOne authenticated insert own filaments"
on public.layerone_filaments
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "LayerOne authenticated update own filaments"
on public.layerone_filaments
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "LayerOne authenticated delete own filaments"
on public.layerone_filaments
for delete
to authenticated
using (auth.uid() = user_id);

create policy "LayerOne authenticated read own profile"
on public.layerone_profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "LayerOne authenticated insert own profile"
on public.layerone_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "LayerOne authenticated update own profile"
on public.layerone_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
