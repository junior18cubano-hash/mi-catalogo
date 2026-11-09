-- JOA GAMERs · Favoritos del catálogo
-- Aditivo: no modifica ni elimina tablas, filas o políticas existentes.
create table if not exists public.catalog_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null,
  item_title text not null,
  item_type text not null default 'otros',
  cover_url text,
  item_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint catalog_favorites_pkey primary key (user_id, item_key),
  constraint catalog_favorites_item_key_length check (char_length(item_key) between 1 and 500),
  constraint catalog_favorites_item_title_length check (char_length(item_title) between 1 and 300)
);
create index if not exists catalog_favorites_user_created_idx
  on public.catalog_favorites (user_id, created_at desc);
alter table public.catalog_favorites enable row level security;
revoke all on table public.catalog_favorites from anon;
revoke update, truncate, references, trigger on table public.catalog_favorites from authenticated;
grant select, insert, delete on table public.catalog_favorites to authenticated;
drop policy if exists "Users read own catalog favorites" on public.catalog_favorites;
create policy "Users read own catalog favorites"
  on public.catalog_favorites for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Users add own catalog favorites" on public.catalog_favorites;
create policy "Users add own catalog favorites"
  on public.catalog_favorites for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "Users remove own catalog favorites" on public.catalog_favorites;
create policy "Users remove own catalog favorites"
  on public.catalog_favorites for delete to authenticated
  using ((select auth.uid()) = user_id);