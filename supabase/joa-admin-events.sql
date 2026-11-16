-- JOA Multiverso: tabla de eventos y permisos administrativos
-- Ejecutar una sola vez en Supabase SQL Editor.
create table if not exists public.joa_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '',
  image_url text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft','published','cancelled','completed')),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index if not exists joa_events_status_start_idx on public.joa_events(status, starts_at);
alter table public.joa_events enable row level security;
drop policy if exists "JOA admins manage events" on public.joa_events;
create policy "JOA admins manage events" on public.joa_events for all to authenticated
using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
drop policy if exists "Anyone can read published JOA events" on public.joa_events;
create policy "Anyone can read published JOA events" on public.joa_events for select to anon, authenticated
using (status = 'published');
-- Permite que solo el administrador envíe notificaciones a cualquier usuario.
drop policy if exists "JOA admins send user notifications" on public.notifications;
create policy "JOA admins send user notifications" on public.notifications for insert to authenticated
with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
