-- LayerOne MVP: migracao para Supabase Auth + dados por usuario.
-- Execute somente quando a tela de login estiver aprovada.
-- Esta migracao troca as politicas abertas de anon por politicas restritas a usuarios autenticados.
-- Registros antigos sem user_id deixam de aparecer apos a migracao.
-- Se quiser iniciar limpo, execute supabase-reset-data.sql antes desta migracao.

alter table public.layerone_filaments
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.layerone_filaments enable row level security;

drop policy if exists "LayerOne anon read filaments" on public.layerone_filaments;
drop policy if exists "LayerOne anon insert filaments" on public.layerone_filaments;
drop policy if exists "LayerOne anon update filaments" on public.layerone_filaments;
drop policy if exists "LayerOne anon delete filaments" on public.layerone_filaments;
drop policy if exists "LayerOne authenticated read own filaments" on public.layerone_filaments;
drop policy if exists "LayerOne authenticated insert own filaments" on public.layerone_filaments;
drop policy if exists "LayerOne authenticated update own filaments" on public.layerone_filaments;
drop policy if exists "LayerOne authenticated delete own filaments" on public.layerone_filaments;

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
