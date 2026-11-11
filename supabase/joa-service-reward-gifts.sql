-- JOA GAMERs · regalos por contratación de servicios informáticos
-- Migración aditiva: conserva las campañas comunitarias y el flujo de login existente.

alter table public.reward_campaigns
  add column if not exists campaign_kind text not null default 'community',
  add column if not exists service_id uuid references public.services(id) on delete restrict,
  add column if not exists reward_product_count integer;

alter table public.reward_claims
  add column if not exists selected_products jsonb not null default '[]'::jsonb,
  add column if not exists username_snapshot text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='reward_campaigns_kind_check' and conrelid='public.reward_campaigns'::regclass) then
    alter table public.reward_campaigns add constraint reward_campaigns_kind_check
      check (campaign_kind in ('community','service_purchase'));
  end if;
  if not exists (select 1 from pg_constraint where conname='reward_campaigns_service_config_check' and conrelid='public.reward_campaigns'::regclass) then
    alter table public.reward_campaigns add constraint reward_campaigns_service_config_check
      check (
        (campaign_kind='community' and service_id is null and reward_product_count is null)
        or
        (campaign_kind='service_purchase' and service_id is not null and reward_product_count between 1 and 12)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname='reward_claims_selected_products_array_check' and conrelid='public.reward_claims'::regclass) then
    alter table public.reward_claims add constraint reward_claims_selected_products_array_check
      check (jsonb_typeof(selected_products)='array' and jsonb_array_length(selected_products)<=12);
  end if;
end $$;

-- Los regalos por servicios no compiten por plazas de ganador.
create or replace function private.enforce_reward_winner_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_limit integer;
  v_count integer;
  v_kind text;
begin
  if new.status not in ('approved','delivered')
     or (tg_op='UPDATE' and old.status in ('approved','delivered')) then
    return new;
  end if;

  select campaign_kind,max_winners
    into v_kind,v_limit
    from public.reward_campaigns
   where id=new.campaign_id;

  if v_kind='service_purchase' then
    return new;
  end if;

  select count(*)::integer into v_count
    from public.reward_claims
   where campaign_id=new.campaign_id
     and status in ('approved','delivered')
     and id<>new.id;

  if v_count >= coalesce(v_limit,0) then
    raise exception 'La campaña ya alcanzó el máximo de ganadores.' using errcode='23514';
  end if;
  return new;
end;
$function$;

-- Impide que una campaña de servicio se solicite por el RPC de comunidad.
create or replace function private.claim_reward_campaign(p_campaign_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_campaign public.reward_campaigns%rowtype;
  v_joined timestamptz;
  v_posts integer := 0;
  v_comments integer := 0;
  v_messages integer := 0;
  v_reactions integer := 0;
  v_points integer := 0;
  v_days integer := 0;
  v_claim_id uuid;
begin
  if v_user is null then raise exception 'Debes iniciar sesión para participar.' using errcode='28000'; end if;
  select * into v_campaign from public.reward_campaigns where id=p_campaign_id for update;
  if not found or v_campaign.status<>'published' or v_campaign.starts_at>now() or (v_campaign.ends_at is not null and v_campaign.ends_at<now()) then
    raise exception 'Esta campaña no está disponible.' using errcode='P0001';
  end if;
  if v_campaign.campaign_kind='service_purchase' then
    raise exception 'Este regalo requiere seleccionar tus productos del catálogo.' using errcode='P0001';
  end if;
  if v_campaign.group_id is not null then
    select gm.joined_at into v_joined from public.group_members gm where gm.group_id=v_campaign.group_id and gm.user_id=v_user;
    if v_joined is null then raise exception 'Debes pertenecer al grupo asociado para participar.' using errcode='P0001'; end if;
    v_days:=greatest(0,floor(extract(epoch from (now()-v_joined))/86400)::integer);
    select count(*)::integer into v_messages from public.messages m
      join public.conversations c on c.id=m.conversation_id
      where m.sender_id=v_user and c.group_id=v_campaign.group_id;
  else
    select count(*)::integer into v_messages from public.messages where sender_id=v_user;
  end if;
  if v_days<v_campaign.min_days_member then raise exception 'Todavía no cumples el tiempo mínimo como miembro.' using errcode='P0001'; end if;
  select count(*)::integer into v_posts from public.posts where author_id=v_user;
  select count(*)::integer into v_comments from public.post_comments where author_id=v_user;
  select count(*)::integer into v_reactions from public.post_reactions where user_id=v_user;
  v_points:=v_posts*3+v_comments*2+v_messages+v_reactions;
  if v_posts<v_campaign.min_posts or v_comments<v_campaign.min_comments or v_messages<v_campaign.min_messages or v_reactions<v_campaign.min_reactions or v_points<v_campaign.min_merit_points then
    raise exception 'Aún no cumples todos los requisitos de actividad de esta recompensa.' using errcode='P0001';
  end if;
  insert into public.reward_claims(campaign_id,user_id,merit_points_snapshot,eligibility_snapshot)
  values(p_campaign_id,v_user,v_points,jsonb_build_object('posts',v_posts,'comments',v_comments,'messages',v_messages,'reactions',v_reactions,'group_days',v_days,'checked_at',now()))
  on conflict(campaign_id,user_id) do nothing returning id into v_claim_id;
  if v_claim_id is null then raise exception 'Ya has solicitado participar en esta campaña.' using errcode='23505'; end if;
  return jsonb_build_object('claim_id',v_claim_id,'status','pending','merit_points',v_points);
end;
$function$;

create or replace function private.claim_service_reward(
  p_campaign_id uuid,
  p_selected_products jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_campaign public.reward_campaigns%rowtype;
  v_service_title text;
  v_username text;
  v_claim_id uuid;
  v_count integer;
  v_unique_count integer;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión para solicitar este regalo.' using errcode='28000';
  end if;

  select * into v_campaign
    from public.reward_campaigns
   where id=p_campaign_id
   for update;

  if not found
     or v_campaign.campaign_kind<>'service_purchase'
     or v_campaign.status<>'published'
     or v_campaign.starts_at>now()
     or (v_campaign.ends_at is not null and v_campaign.ends_at<now()) then
    raise exception 'Este regalo por servicio no está disponible.' using errcode='P0001';
  end if;

  if p_selected_products is null or jsonb_typeof(p_selected_products)<>'array' then
    raise exception 'Debes seleccionar los productos del catálogo.' using errcode='22023';
  end if;

  v_count:=jsonb_array_length(p_selected_products);
  if v_count<>v_campaign.reward_product_count then
    raise exception 'Debes seleccionar exactamente % productos.',v_campaign.reward_product_count using errcode='22023';
  end if;

  if exists (
    select 1
      from jsonb_array_elements(p_selected_products) p
     where jsonb_typeof(p)<>'object'
        or coalesce(length(trim(p->>'key')),0)=0
        or coalesce(length(trim(p->>'title')),0)=0
        or length(coalesce(p->>'key',''))>180
        or length(coalesce(p->>'title',''))>300
  ) then
    raise exception 'Uno de los productos seleccionados no tiene datos válidos.' using errcode='22023';
  end if;

  select count(distinct p->>'key') into v_unique_count
    from jsonb_array_elements(p_selected_products) p;
  if v_unique_count<>v_count then
    raise exception 'No puedes seleccionar el mismo producto más de una vez.' using errcode='22023';
  end if;

  select title into v_service_title
    from public.services
   where id=v_campaign.service_id and is_active=true;
  if v_service_title is null then
    raise exception 'El servicio asociado ya no está disponible.' using errcode='P0001';
  end if;

  select coalesce(nullif(trim(username),''),nullif(trim(display_name),''),'jugador')
    into v_username
    from public.profiles
   where id=v_user;

  v_username:=coalesce(v_username,'jugador');

  insert into public.reward_claims(
    campaign_id,user_id,status,merit_points_snapshot,eligibility_snapshot,
    selected_products,username_snapshot
  )
  values(
    p_campaign_id,v_user,'pending',0,
    jsonb_build_object(
      'claim_kind','service_purchase',
      'service_id',v_campaign.service_id,
      'service_title',v_service_title,
      'required_products',v_campaign.reward_product_count,
      'checked_at',now()
    ),
    p_selected_products,v_username
  )
  on conflict(campaign_id,user_id) do nothing
  returning id into v_claim_id;

  if v_claim_id is null then
    raise exception 'Ya has solicitado este regalo. El administrador revisará tu solicitud.' using errcode='23505';
  end if;

  insert into public.notifications(user_id,type,title,body,data)
  values(
    v_user,
    'service_reward_claimed',
    'Tu regalo especial de JOA está reservado',
    format(
      '¡Hola, @%s! Has solicitado un regalo especial de JOA GAMERs. Ven a J.O.A GAMER''s PC y contrata el servicio «%s». Al hacerlo, recibirás tu paquete completo de %s productos digitales, elegidos por ti del catálogo JOA. ¡Te esperamos!',
      v_username,v_service_title,v_campaign.reward_product_count
    ),
    jsonb_build_object(
      'claim_id',v_claim_id,
      'campaign_id',p_campaign_id,
      'service_id',v_campaign.service_id,
      'service_title',v_service_title,
      'reward_product_count',v_campaign.reward_product_count,
      'selected_products',p_selected_products
    )
  );

  return jsonb_build_object(
    'claim_id',v_claim_id,
    'status','pending',
    'username',v_username,
    'service_title',v_service_title,
    'reward_product_count',v_campaign.reward_product_count
  );
end;
$function$;

create or replace function public.claim_service_reward(
  p_campaign_id uuid,
  p_selected_products jsonb
)
returns jsonb
language sql
set search_path = ''
as $function$
  select private.claim_service_reward(p_campaign_id,p_selected_products);
$function$;

revoke all on function private.claim_service_reward(uuid,jsonb) from public, anon, authenticated;
grant execute on function private.claim_service_reward(uuid,jsonb) to authenticated;
revoke all on function public.claim_service_reward(uuid,jsonb) from public, anon;
grant execute on function public.claim_service_reward(uuid,jsonb) to authenticated;

-- Solo se permite que el RPC autenticado cree solicitudes; el cliente no recibe INSERT directo.
