-- JOA GAMERs · Corrección de acceso a chats directos
-- HISTÓRICO: el ajuste ya fue aplicado al proyecto Supabase activo.
-- No volver a ejecutar como parte de esta actualización de frontend.
-- Aplicado al proyecto Supabase activo el 2026-11-09.
-- Evita la recursión RLS: la política de conversation_members ya no consulta
-- conversations directamente bajo RLS; delega la comprobación a esta función
-- SECURITY DEFINER, con search_path vacío y validación del usuario autenticado.
--
-- Solo el creador autenticado de una conversación directa puede añadir
-- al propio creador y al destinatario definido en direct_user_id.

create or replace function private.is_direct_conversation_creator(
  p_conversation_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.conversations c
    where c.id = p_conversation_id
      and c.created_by = auth.uid()
      and c.group_id is null
      and p_user_id in (c.created_by, c.direct_user_id)
  );
$function$;

revoke all on function private.is_direct_conversation_creator(uuid, uuid) from public, anon;
grant execute on function private.is_direct_conversation_creator(uuid, uuid) to authenticated;

drop policy if exists "Conversation creator manages membership"
  on public.conversation_members;

create policy "Conversation creator manages membership"
on public.conversation_members
for insert
to authenticated
with check (
  private.is_direct_conversation_creator(conversation_id, user_id)
);
