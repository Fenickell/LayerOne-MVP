create table if not exists public.layerone_filaments (
  id uuid primary key,
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

alter table public.layerone_filaments enable row level security;

drop policy if exists "LayerOne anon read filaments" on public.layerone_filaments;
drop policy if exists "LayerOne anon insert filaments" on public.layerone_filaments;
drop policy if exists "LayerOne anon update filaments" on public.layerone_filaments;
drop policy if exists "LayerOne anon delete filaments" on public.layerone_filaments;

create policy "LayerOne anon read filaments"
on public.layerone_filaments
for select
to anon
using (true);

create policy "LayerOne anon insert filaments"
on public.layerone_filaments
for insert
to anon
with check (true);

create policy "LayerOne anon update filaments"
on public.layerone_filaments
for update
to anon
using (true)
with check (true);

create policy "LayerOne anon delete filaments"
on public.layerone_filaments
for delete
to anon
using (true);
