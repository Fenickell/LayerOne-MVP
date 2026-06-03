-- LayerOne MVP: cadastro de impressoras por usuario.
-- Rode este arquivo no SQL Editor do Supabase se o schema principal ja existe.

create table if not exists public.layerone_printers (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  model text,
  purchase_cost numeric not null default 0,
  life_hours numeric not null default 1,
  average_kw numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.layerone_printers enable row level security;

drop policy if exists "LayerOne authenticated read own printers" on public.layerone_printers;
drop policy if exists "LayerOne authenticated insert own printers" on public.layerone_printers;
drop policy if exists "LayerOne authenticated update own printers" on public.layerone_printers;
drop policy if exists "LayerOne authenticated delete own printers" on public.layerone_printers;

create policy "LayerOne authenticated read own printers"
on public.layerone_printers
for select
to authenticated
using (auth.uid() = user_id);

create policy "LayerOne authenticated insert own printers"
on public.layerone_printers
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "LayerOne authenticated update own printers"
on public.layerone_printers
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "LayerOne authenticated delete own printers"
on public.layerone_printers
for delete
to authenticated
using (auth.uid() = user_id);
