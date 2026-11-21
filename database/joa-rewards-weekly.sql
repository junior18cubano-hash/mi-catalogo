-- JOA REWARDS · weekly campaign engine
-- Adds weekly activity-based entries without replacing legacy reward campaigns/claims.
-- Weekly periods use America/Havana; the entry key changes every Monday and preserves history.

alter table public.reward_campaigns
  add column if not exists weekly_enabled boolean not null default false,
  add column if not exists weekly_entry_cap integer not null default 20,
  add column if not exists weekly_activity_rules jsonb not null default '{"profile_complete":2,"post":2,"review":2,"group_join":1,"comment":1,"reaction":1,"message":1}'::jsonb,
  add column if not exists weekly_reset_enabled boolean not null default true,
  add column if not exists weekly_draw_day text not null default 'sunday',
  add column if not exists announce_winners_immediately boolean not null default true;

alter table public.reward_campaigns drop constraint if exists reward_campaigns_weekly_entry_cap_check;
alter table public.reward_campaigns add constraint reward_campaigns_weekly_entry_cap_check check (weekly_entry_cap between 1 and 1000);
alter table public.reward_campaigns drop constraint if exists reward_campaigns_weekly_draw_day_check;
alter table public.reward_campaigns add constraint reward_campaigns_weekly_draw_day_check check (weekly_draw_day in ('sunday'));

create table if not exists public.reward_entries (
  campaign_id uuid not null references public.reward_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  entries integer not null default 0 check (entries >= 0),
  updated_at timestamptz not null default now(),
  primary key (campaign_id,user_id,week_start)
);
create index if not exists reward_entries_campaign_week_idx on public.reward_entries(campaign_id,week_start,entries desc);
create index if not exists reward_entries_user_id_idx on public.reward_entries(user_id);

create table if not exists public.reward_activity_log (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.reward_campaigns(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null,
  source_id uuid not null,
  week_start date not null,
  entries_awarded integer not null check (entries_awarded > 0),
  created_at timestamptz not null default now(),
  unique (campaign_id,user_id,activity_type,source_id,week_start)
);
create index if not exists reward_activity_log_campaign_week_idx on public.reward_activity_log(campaign_id,week_start,user_id);
create index if not exists reward_activity_log_user_id_idx on public.reward_activity_log(user_id);

create table if not exists public.reward_weekly_draws (
  campaign_id uuid not null references public.reward_campaigns(id) on delete cascade,
  week_start date not null,
  participants_count integer not null default 0,
  total_entries integer not null default 0,
  winners_count integer not null default 0,
  drawn_by uuid references auth.users(id) on delete set null,
  drawn_at timestamptz not null default now(),
  primary key (campaign_id,week_start)
);
create index if not exists reward_weekly_draws_drawn_by_idx on public.reward_weekly_draws(drawn_by);

create table if not exists public.reward_winners (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.reward_campaigns(id) on delete cascade,
  week_start date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  winner_rank integer not null,
  entries_snapshot integer not null default 0,
  username_snapshot text,
  display_name_snapshot text,
  avatar_url_snapshot text,
  prize_snapshot text not null default '',
  delivery_status text not null default 'pending' check (delivery_status in ('pending','contacted','delivered','rejected')),
  admin_note text not null default '',
  delivered_at timestamptz,
  drawn_at timestamptz not null default now(),
  unique (campaign_id,week_start,user_id),
  unique (campaign_id,week_start,winner_rank)
);
create index if not exists reward_winners_public_idx on public.reward_winners(campaign_id,week_start,winner_rank);
create index if not exists reward_winners_user_id_idx on public.reward_winners(user_id);

alter table public.reward_entries enable row level security;
alter table public.reward_activity_log enable row level security;
alter table public.reward_weekly_draws enable row level security;
alter table public.reward_winners enable row level security;

grant select on public.reward_entries to anon, authenticated;
grant select on public.reward_weekly_draws to anon, authenticated;
grant select, update on public.reward_winners to authenticated;
grant select on public.reward_activity_log to authenticated;

drop policy if exists "Public can view weekly reward entries" on public.reward_entries;
create policy "Public can view weekly reward entries" on public.reward_entries
for select to anon, authenticated using (exists (
  select 1 from public.reward_campaigns c
  where c.id=reward_entries.campaign_id and c.weekly_enabled
    and c.status in ('published','paused','ended') and c.starts_at<=now()
));
drop policy if exists "Admins read weekly reward activity" on public.reward_activity_log;
create policy "Admins read weekly reward activity" on public.reward_activity_log
for select to authenticated using ((select (auth.jwt()->'app_metadata'->>'role')='admin'));
drop policy if exists "Public can view weekly draw summaries" on public.reward_weekly_draws;
create policy "Public can view weekly draw summaries" on public.reward_weekly_draws
for select to anon, authenticated using (exists (
  select 1 from public.reward_campaigns c
  where c.id=reward_weekly_draws.campaign_id and c.weekly_enabled
    and c.status in ('published','paused','ended')
));
drop policy if exists "Public can view weekly winners" on public.reward_winners;
create policy "Public can view weekly winners" on public.reward_winners
for select to anon, authenticated using (exists (
  select 1 from public.reward_campaigns c
  where c.id=reward_winners.campaign_id and c.weekly_enabled
    and c.status in ('published','paused','ended')
));
drop policy if exists "Admins update weekly winner delivery" on public.reward_winners;
create policy "Admins update weekly winner delivery" on public.reward_winners
for update to authenticated
using ((select (auth.jwt()->'app_metadata'->>'role')='admin'))
with check ((select (auth.jwt()->'app_metadata'->>'role')='admin'));

create or replace function private.award_weekly_reward_activity()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare
  v_payload jsonb := to_jsonb(new);
  v_user_id uuid;
  v_source_id uuid;
  v_week_start date := (date_trunc('week', now() at time zone 'America/Havana'))::date;
  v_campaign record;
  v_rule integer;
  v_current integer;
  v_award integer;
  v_log_id uuid;
begin
  v_user_id := nullif(v_payload->>tg_argv[1],'')::uuid;
  v_source_id := nullif(v_payload->>tg_argv[2],'')::uuid;
  if v_user_id is null or v_source_id is null then return new; end if;
  if tg_argv[0]='group_join' and coalesce(v_payload->>'role','member') <> 'member' then return new; end if;
  if tg_argv[0]='profile_complete' and (
    coalesce(nullif(v_payload->>'username',''),'')='' or
    coalesce(nullif(v_payload->>'display_name',''),'')=''
  ) then return new; end if;

  for v_campaign in
    select c.id,c.weekly_activity_rules,c.weekly_entry_cap
    from public.reward_campaigns c
    where c.weekly_enabled=true and c.campaign_kind='community'
      and c.selection_mode='raffle' and c.status='published'
      and c.starts_at<=now() and (c.ends_at is null or c.ends_at>=now())
  loop
    v_rule := greatest(0,coalesce((v_campaign.weekly_activity_rules->>tg_argv[0])::integer,0));
    if v_rule=0 then continue; end if;
    insert into public.reward_entries(campaign_id,user_id,week_start,entries)
    values(v_campaign.id,v_user_id,v_week_start,0)
    on conflict(campaign_id,user_id,week_start) do nothing;
    select e.entries into v_current from public.reward_entries e
    where e.campaign_id=v_campaign.id and e.user_id=v_user_id and e.week_start=v_week_start for update;
    v_award := least(v_rule,greatest(0,v_campaign.weekly_entry_cap-v_current));
    if v_award<=0 then continue; end if;
    insert into public.reward_activity_log(campaign_id,user_id,activity_type,source_id,week_start,entries_awarded)
    values(v_campaign.id,v_user_id,tg_argv[0],v_source_id,v_week_start,v_award)
    on conflict(campaign_id,user_id,activity_type,source_id,week_start) do nothing
    returning id into v_log_id;
    if v_log_id is not null then
      update public.reward_entries set entries=entries+v_award,updated_at=now()
      where campaign_id=v_campaign.id and user_id=v_user_id and week_start=v_week_start;
    end if;
    v_log_id := null;
  end loop;
  return new;
end;
$function$;

drop trigger if exists reward_weekly_posts_award on public.posts;
create trigger reward_weekly_posts_award after insert on public.posts
for each row execute function private.award_weekly_reward_activity('post','author_id','id');
drop trigger if exists reward_weekly_reviews_award on public.catalog_reviews;
create trigger reward_weekly_reviews_award after insert on public.catalog_reviews
for each row execute function private.award_weekly_reward_activity('review','user_id','id');
drop trigger if exists reward_weekly_comments_award on public.post_comments;
create trigger reward_weekly_comments_award after insert on public.post_comments
for each row execute function private.award_weekly_reward_activity('comment','author_id','id');
drop trigger if exists reward_weekly_reactions_award on public.post_reactions;
create trigger reward_weekly_reactions_award after insert on public.post_reactions
for each row execute function private.award_weekly_reward_activity('reaction','user_id','post_id');
drop trigger if exists reward_weekly_messages_award on public.messages;
create trigger reward_weekly_messages_award after insert on public.messages
for each row execute function private.award_weekly_reward_activity('message','sender_id','id');
drop trigger if exists reward_weekly_group_join_award on public.group_members;
create trigger reward_weekly_group_join_award after insert on public.group_members
for each row execute function private.award_weekly_reward_activity('group_join','user_id','group_id');
drop trigger if exists reward_weekly_profile_award on public.profiles;
create trigger reward_weekly_profile_award after insert or update of username,display_name on public.profiles
for each row execute function private.award_weekly_reward_activity('profile_complete','id','id');

create or replace function private.draw_weekly_reward_winners(p_campaign_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  v_campaign public.reward_campaigns%rowtype;
  v_week_start date := (date_trunc('week', now() at time zone 'America/Havana'))::date;
  v_total integer := 0;
  v_participants integer := 0;
  v_selected integer := 0;
  v_remaining bigint;
  v_ticket bigint;
  v_candidate record;
  v_profile record;
  v_rank integer := 0;
begin
  if auth.uid() is null or (auth.jwt()->'app_metadata'->>'role') <> 'admin' then
    raise exception 'Acceso administrativo requerido.' using errcode='42501';
  end if;
  select * into v_campaign from public.reward_campaigns where id=p_campaign_id for update;
  if not found or not v_campaign.weekly_enabled then raise exception 'Esta campaña no tiene habilitado el modo semanal.' using errcode='P0001'; end if;
  if v_campaign.selection_mode<>'raffle' then raise exception 'El sorteo semanal requiere selección aleatoria.' using errcode='P0001'; end if;
  if v_campaign.status not in ('published','paused','ended') or v_campaign.starts_at>now() then raise exception 'La campaña semanal todavía no está disponible.' using errcode='P0001'; end if;
  if exists(select 1 from public.reward_weekly_draws d where d.campaign_id=p_campaign_id and d.week_start=v_week_start) then
    return jsonb_build_object('already_drawn',true,'selected_now',0,'week_start',v_week_start);
  end if;
  select count(*)::integer,coalesce(sum(e.entries),0)::integer into v_participants,v_total
  from public.reward_entries e where e.campaign_id=p_campaign_id and e.week_start=v_week_start and e.entries>0;
  while v_selected < greatest(1,v_campaign.max_winners) loop
    select coalesce(sum(e.entries),0) into v_remaining from public.reward_entries e
    where e.campaign_id=p_campaign_id and e.week_start=v_week_start and e.entries>0
      and not exists(select 1 from public.reward_winners w where w.campaign_id=p_campaign_id and w.week_start=v_week_start and w.user_id=e.user_id);
    exit when v_remaining<=0;
    v_ticket := floor(random()*v_remaining)::bigint+1;
    select picked.user_id,picked.entries into v_candidate from (
      select e.user_id,e.entries,sum(e.entries) over(order by e.user_id) as cumulative
      from public.reward_entries e where e.campaign_id=p_campaign_id and e.week_start=v_week_start and e.entries>0
        and not exists(select 1 from public.reward_winners w where w.campaign_id=p_campaign_id and w.week_start=v_week_start and w.user_id=e.user_id)
    ) picked where picked.cumulative>=v_ticket order by picked.cumulative limit 1;
    exit when v_candidate.user_id is null;
    select p.username,p.display_name,p.avatar_url into v_profile from public.profiles p where p.id=v_candidate.user_id;
    v_rank:=v_selected+1;
    insert into public.reward_winners(campaign_id,week_start,user_id,winner_rank,entries_snapshot,username_snapshot,display_name_snapshot,avatar_url_snapshot,prize_snapshot)
    values(p_campaign_id,v_week_start,v_candidate.user_id,v_rank,v_candidate.entries,v_profile.username,v_profile.display_name,v_profile.avatar_url,v_campaign.title);
    if v_campaign.announce_winners_immediately then
      insert into public.notifications(user_id,type,title,body,data)
      values(v_candidate.user_id,'reward','¡Has ganado en JOA REWARDS!','Felicidades: has ganado «'||v_campaign.title||'». Entra en JOA para consultar la entrega de tu premio.',
        jsonb_build_object('campaign_id',p_campaign_id,'winner_id',(select w.id from public.reward_winners w where w.campaign_id=p_campaign_id and w.week_start=v_week_start and w.user_id=v_candidate.user_id),'week_start',v_week_start,'source','joa_rewards'));
    end if;
    v_selected:=v_selected+1;
  end loop;
  insert into public.reward_weekly_draws(campaign_id,week_start,participants_count,total_entries,winners_count,drawn_by)
  values(p_campaign_id,v_week_start,v_participants,v_total,v_selected,auth.uid());
  insert into public.reward_audit_log(actor_id,action,entity_type,entity_id,details)
  values(auth.uid(),'weekly_draw','reward_campaign',p_campaign_id,jsonb_build_object('week_start',v_week_start,'participants',v_participants,'entries',v_total,'winners',v_selected));
  return jsonb_build_object('already_drawn',false,'selected_now',v_selected,'participants_count',v_participants,'total_entries',v_total,'week_start',v_week_start,'announced_immediately',v_campaign.announce_winners_immediately);
end;
$function$;

create or replace function public.draw_reward_winners(p_campaign_id uuid)
returns jsonb language plpgsql security invoker set search_path=''
as $function$
begin
  if exists(select 1 from public.reward_campaigns c where c.id=p_campaign_id and c.weekly_enabled) then
    return private.draw_weekly_reward_winners(p_campaign_id);
  end if;
  return private.draw_reward_winners(p_campaign_id);
end;
$function$;
revoke all on function private.draw_weekly_reward_winners(uuid) from public,anon;
grant execute on function private.draw_weekly_reward_winners(uuid) to authenticated;
revoke all on function private.draw_reward_winners(uuid) from public,anon;
grant execute on function private.draw_reward_winners(uuid) to authenticated;
revoke all on function private.award_weekly_reward_activity() from public,anon,authenticated;
revoke all on function public.draw_reward_winners(uuid) from public,anon;
grant execute on function public.draw_reward_winners(uuid) to authenticated;
