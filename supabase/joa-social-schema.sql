-- JOA GAMERs: base social inicial. Ejecutar en Supabase SQL Editor.
-- Tablas nuevas con prefijo joa_; no altera las tablas del catálogo existente.
create extension if not exists pgcrypto;

create table if not exists public.joa_profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 username text unique not null check (char_length(username) between 3 and 24),
 display_name text not null default 'Jugador JOA',
 avatar_url text,
 bio text not null default '' check (char_length(bio)<=280),
 favorite_platform text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.joa_posts (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references auth.users(id) on delete cascade,
 body text not null check (char_length(body) between 1 and 3000),
 media_url text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.joa_comments (
 id uuid primary key default gen_random_uuid(),
 post_id uuid not null references public.joa_posts(id) on delete cascade,
 author_id uuid not null references auth.users(id) on delete cascade,
 body text not null check (char_length(body) between 1 and 1500),
 created_at timestamptz not null default now()
);
create table if not exists public.joa_reactions (
 post_id uuid not null references public.joa_posts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 reaction text not null default 'like' check (reaction in ('like','fire','heart')),
 created_at timestamptz not null default now(),
 primary key(post_id,user_id)
);
create table if not exists public.joa_friendships (
 id uuid primary key default gen_random_uuid(),
 requester_id uuid not null references auth.users(id) on delete cascade,
 addressee_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'pending' check(status in ('pending','accepted','declined','blocked')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(requester_id<>addressee_id),
 unique(requester_id,addressee_id)
);
create table if not exists public.joa_groups (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(name) between 3 and 60),
 description text not null default '' check(char_length(description)<=500),
 is_public boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.joa_group_members (
 group_id uuid not null references public.joa_groups(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null default 'member' check(role in ('owner','moderator','member')),
 joined_at timestamptz not null default now(),
 primary key(group_id,user_id)
);
create table if not exists public.joa_conversations (
 id uuid primary key default gen_random_uuid(),
 is_group boolean not null default false,
 title text,
 created_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table if not exists public.joa_conversation_members (
 conversation_id uuid not null references public.joa_conversations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 joined_at timestamptz not null default now(),
 primary key(conversation_id,user_id)
);
create table if not exists public.joa_messages (
 id uuid primary key default gen_random_uuid(),
 conversation_id uuid not null references public.joa_conversations(id) on delete cascade,
 sender_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(char_length(body) between 1 and 5000),
 created_at timestamptz not null default now(),
 read_at timestamptz
);
create table if not exists public.joa_reviews (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references auth.users(id) on delete cascade,
 catalog_item_id text not null,
 rating smallint not null check(rating between 1 and 5),
 title text not null check(char_length(title) between 2 and 100),
 body text not null check(char_length(body) between 1 and 3000),
 created_at timestamptz not null default now(),
 unique(author_id,catalog_item_id)
);
create table if not exists public.joa_favorites (
 user_id uuid not null references auth.users(id) on delete cascade,
 catalog_item_id text not null,
 created_at timestamptz not null default now(),
 primary key(user_id,catalog_item_id)
);

create index if not exists joa_posts_created_idx on public.joa_posts(created_at desc);
create index if not exists joa_comments_post_idx on public.joa_comments(post_id,created_at);
create index if not exists joa_messages_conversation_idx on public.joa_messages(conversation_id,created_at);
create index if not exists joa_reviews_item_idx on public.joa_reviews(catalog_item_id,created_at desc);
create index if not exists joa_friendships_addressee_idx on public.joa_friendships(addressee_id,status);

alter table public.joa_profiles enable row level security;
alter table public.joa_posts enable row level security;
alter table public.joa_comments enable row level security;
alter table public.joa_reactions enable row level security;
alter table public.joa_friendships enable row level security;
alter table public.joa_groups enable row level security;
alter table public.joa_group_members enable row level security;
alter table public.joa_conversations enable row level security;
alter table public.joa_conversation_members enable row level security;
alter table public.joa_messages enable row level security;
alter table public.joa_reviews enable row level security;
alter table public.joa_favorites enable row level security;

-- Perfiles públicos: cada usuario solo puede modificar su propio perfil.
drop policy if exists "joa profiles readable" on public.joa_profiles;
create policy "joa profiles readable" on public.joa_profiles for select to authenticated using(true);
drop policy if exists "joa profiles insert own" on public.joa_profiles;
create policy "joa profiles insert own" on public.joa_profiles for insert to authenticated with check(auth.uid()=user_id);
drop policy if exists "joa profiles update own" on public.joa_profiles;
create policy "joa profiles update own" on public.joa_profiles for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);

-- Feed comunitario autenticado.
drop policy if exists "joa posts readable" on public.joa_posts;
create policy "joa posts readable" on public.joa_posts for select to authenticated using(true);
drop policy if exists "joa posts create own" on public.joa_posts;
create policy "joa posts create own" on public.joa_posts for insert to authenticated with check(auth.uid()=author_id);
drop policy if exists "joa posts update own" on public.joa_posts;
create policy "joa posts update own" on public.joa_posts for update to authenticated using(auth.uid()=author_id) with check(auth.uid()=author_id);
drop policy if exists "joa posts delete own" on public.joa_posts;
create policy "joa posts delete own" on public.joa_posts for delete to authenticated using(auth.uid()=author_id);

drop policy if exists "joa comments readable" on public.joa_comments;
create policy "joa comments readable" on public.joa_comments for select to authenticated using(true);
drop policy if exists "joa comments create own" on public.joa_comments;
create policy "joa comments create own" on public.joa_comments for insert to authenticated with check(auth.uid()=author_id);
drop policy if exists "joa comments edit own" on public.joa_comments;
create policy "joa comments edit own" on public.joa_comments for update to authenticated using(auth.uid()=author_id) with check(auth.uid()=author_id);
drop policy if exists "joa comments delete own" on public.joa_comments;
create policy "joa comments delete own" on public.joa_comments for delete to authenticated using(auth.uid()=author_id);

drop policy if exists "joa reactions readable" on public.joa_reactions;
create policy "joa reactions readable" on public.joa_reactions for select to authenticated using(true);
drop policy if exists "joa reactions own" on public.joa_reactions;
create policy "joa reactions own" on public.joa_reactions for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);

-- Las solicitudes solo son visibles para los dos participantes.
drop policy if exists "joa friendship participants read" on public.joa_friendships;
create policy "joa friendship participants read" on public.joa_friendships for select to authenticated using(auth.uid()=requester_id or auth.uid()=addressee_id);
drop policy if exists "joa friendship request own" on public.joa_friendships;
create policy "joa friendship request own" on public.joa_friendships for insert to authenticated with check(auth.uid()=requester_id);
drop policy if exists "joa friendship participants update" on public.joa_friendships;
create policy "joa friendship participants update" on public.joa_friendships for update to authenticated using(auth.uid()=requester_id or auth.uid()=addressee_id) with check(auth.uid()=requester_id or auth.uid()=addressee_id);
drop policy if exists "joa friendship requester delete" on public.joa_friendships;
create policy "joa friendship requester delete" on public.joa_friendships for delete to authenticated using(auth.uid()=requester_id);

-- Helpers SECURITY DEFINER evitan recursión entre políticas RLS relacionadas.
create or replace function public.joa_is_group_member(target_group uuid, target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public
as $ select exists(select 1 from public.joa_group_members gm where gm.group_id=target_group and gm.user_id=target_user) $;
create or replace function public.joa_is_conversation_member(target_conversation uuid, target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path=public
as $ select exists(select 1 from public.joa_conversation_members cm where cm.conversation_id=target_conversation and cm.user_id=target_user) $;

-- Grupos públicos visibles; grupos privados solo para miembros/propietario.
drop policy if exists "joa groups visible" on public.joa_groups;
create policy "joa groups visible" on public.joa_groups for select to authenticated using(is_public or owner_id=auth.uid() or public.joa_is_group_member(id));
drop policy if exists "joa groups create own" on public.joa_groups;
create policy "joa groups create own" on public.joa_groups for insert to authenticated with check(auth.uid()=owner_id);
drop policy if exists "joa groups owner update" on public.joa_groups;
create policy "joa groups owner update" on public.joa_groups for update to authenticated using(auth.uid()=owner_id) with check(auth.uid()=owner_id);
drop policy if exists "joa groups owner delete" on public.joa_groups;
create policy "joa groups owner delete" on public.joa_groups for delete to authenticated using(auth.uid()=owner_id);

drop policy if exists "joa group members visible" on public.joa_group_members;
create policy "joa group members visible" on public.joa_group_members for select to authenticated using(public.joa_is_group_member(group_id) or user_id=auth.uid() or exists(select 1 from public.joa_groups g where g.id=group_id and g.is_public));
drop policy if exists "joa group members join self" on public.joa_group_members;
create policy "joa group members join self" on public.joa_group_members for insert to authenticated with check(auth.uid()=user_id and exists(select 1 from public.joa_groups g where g.id=group_id and g.is_public));
drop policy if exists "joa group members leave self" on public.joa_group_members;
create policy "joa group members leave self" on public.joa_group_members for delete to authenticated using(auth.uid()=user_id or exists(select 1 from public.joa_groups g where g.id=group_id and g.owner_id=auth.uid()));

-- Conversaciones y mensajes: únicamente miembros pueden leer y escribir.
drop policy if exists "joa conversation member read" on public.joa_conversations;
create policy "joa conversation member read" on public.joa_conversations for select to authenticated using(public.joa_is_conversation_member(id));
drop policy if exists "joa conversation create" on public.joa_conversations;
create policy "joa conversation create" on public.joa_conversations for insert to authenticated with check(auth.uid()=created_by);
drop policy if exists "joa conversation members read" on public.joa_conversation_members;
create policy "joa conversation members read" on public.joa_conversation_members for select to authenticated using(public.joa_is_conversation_member(conversation_id));
drop policy if exists "joa conversation members add" on public.joa_conversation_members;
create policy "joa conversation members add" on public.joa_conversation_members for insert to authenticated with check(auth.uid()=user_id or exists(select 1 from public.joa_conversations c where c.id=conversation_id and c.created_by=auth.uid()));
drop policy if exists "joa messages read members" on public.joa_messages;
create policy "joa messages read members" on public.joa_messages for select to authenticated using(public.joa_is_conversation_member(conversation_id));
drop policy if exists "joa messages send members" on public.joa_messages;
create policy "joa messages send members" on public.joa_messages for insert to authenticated with check(auth.uid()=sender_id and public.joa_is_conversation_member(conversation_id));
drop policy if exists "joa messages edit own" on public.joa_messages;
create policy "joa messages edit own" on public.joa_messages for update to authenticated using(auth.uid()=sender_id and public.joa_is_conversation_member(conversation_id)) with check(auth.uid()=sender_id);

drop policy if exists "joa reviews readable" on public.joa_reviews;
create policy "joa reviews readable" on public.joa_reviews for select to authenticated using(true);
drop policy if exists "joa reviews own" on public.joa_reviews;
create policy "joa reviews own" on public.joa_reviews for all to authenticated using(auth.uid()=author_id) with check(auth.uid()=author_id);
drop policy if exists "joa favorites own" on public.joa_favorites;
create policy "joa favorites own" on public.joa_favorites for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);

-- Perfil automático al registrar una cuenta: username temporal basado en UUID.
create or replace function public.joa_handle_new_user()
returns trigger language plpgsql security definer set search_path=public
as $$
declare base_name text;
begin
 base_name := 'jugador_' || left(replace(new.id::text,'-',''),10);
 insert into public.joa_profiles(user_id,username,display_name)
 values(new.id,base_name,coalesce(new.raw_user_meta_data->>'display_name','Jugador JOA'))
 on conflict(user_id) do nothing;
 return new;
end;
$$;
drop trigger if exists joa_auth_user_created on auth.users;
create trigger joa_auth_user_created after insert on auth.users for each row execute procedure public.joa_handle_new_user();

-- IMPORTANTE: para mensajería en tiempo real, habilitar joa_messages en Realtime
-- desde Supabase Dashboard > Database > Publications después de revisar las políticas.
