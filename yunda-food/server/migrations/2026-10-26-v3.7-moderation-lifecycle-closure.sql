-- v3.7：审核动作的用户侧回执与可见性闭环。
-- 依赖 v3.4、v3.5、v3.6：本迁移不删除既有用户内容。

-- 仅管理员/数据库所有者可审计；普通访客与内容作者均不能读取其他人的记录。
create table if not exists public.moderation_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  subject_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('item_hidden', 'item_restored', 'review_hidden', 'review_restored', 'profile_restricted', 'profile_restored')),
  target_type text not null check (target_type in ('item', 'review', 'profile')),
  target_id text not null,
  reason text,
  created_at timestamptz not null default now()
);
alter table public.moderation_audit_log enable row level security;
revoke all on public.moderation_audit_log from anon, authenticated;

-- 作者能查看自己的下架投稿及原因；普通读者的 food_items RLS 保持只读 published。
create or replace function public.my_food_items()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) - 'owner' - 'lat' - 'lng' order by x.submitted_at desc)
    from (select * from public.food_items where owner=v_uid and source='user') x
  ), '[]'::jsonb);
end; $$;

-- 评论作者只读自己的审核结果；父投稿下架时同时返回不可跳转状态。
create or replace function public.my_reviews()
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',r.id,'item_id',r.item_id,'item_name',f.name,'item_status',f.status,
    'nickname',r.nickname,'rating',r.rating,'text',r.text,'ate_date',r.ate_date,'created_at',r.created_at,
    'moderation_status',r.moderation_status,'moderation_reason',r.moderation_reason
  ) order by r.created_at desc), '[]'::jsonb)
  from public.reviews r join public.food_items f on f.id=r.item_id where r.user_id=auth.uid();
$$;

create or replace function public.my_review(p_item_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid := auth.uid(); v_row record;
begin
  if v_uid is null then return null; end if;
  select r.*, f.name as item_name, f.status as item_status into v_row
  from public.reviews r join public.food_items f on f.id=r.item_id
  where r.item_id=p_item_id and r.user_id=v_uid limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'id',v_row.id,'item_id',v_row.item_id,'item_name',v_row.item_name,'item_status',v_row.item_status,
    'nickname',v_row.nickname,'rating',v_row.rating,'text',v_row.text,'ate_date',v_row.ate_date,'created_at',v_row.created_at,
    'moderation_status',v_row.moderation_status,'moderation_reason',v_row.moderation_reason
  );
end; $$;

-- 限制原因只返回给当前身份本人。
create or replace function public.my_profile()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid := auth.uid(); v_row public.profiles;
begin
  if v_uid is null then return null; end if;
  select * into v_row from public.profiles where user_id=v_uid;
  if not found then return null; end if;
  return jsonb_build_object(
    'foodie_id',v_row.foodie_id,'hometown',v_row.hometown,'taste_preferences',v_row.taste_preferences,'default_area_id',v_row.default_area_id,
    'moderation_status',v_row.moderation_status,'moderation_reason',v_row.moderation_reason,'moderated_at',v_row.moderated_at
  );
end; $$;

-- 公开评论必须同时拥有公开的父投稿，避免“菜已下架、评论仍可用 API 读取”。
drop policy if exists "read reviews" on public.reviews;
drop policy if exists "read published reviews" on public.reviews;
create policy "read published reviews for published items" on public.reviews for select to anon, authenticated
using (
  moderation_status='published'
  and exists (select 1 from public.food_items f where f.id=item_id and f.status='published')
);

-- 被限制、未初始化资料的身份不能先占用公开 Storage 再被投稿 RPC 拒绝。
create or replace function public.can_upload_food_photo()
returns boolean language sql security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.profiles where user_id=auth.uid() and moderation_status='active');
$$;
revoke all on function public.can_upload_food_photo() from public;
grant execute on function public.can_upload_food_photo() to authenticated;
drop policy if exists "auth upload own food photos" on storage.objects;
create policy "auth upload own food photos" on storage.objects for insert to authenticated
with check (
  bucket_id='food-photos' and (storage.foldername(name))[1]=auth.uid()::text
  and lower(storage.extension(name)) in ('jpg','jpeg','png','webp')
  and public.can_upload_food_photo()
);
drop policy if exists "auth delete own food photos" on storage.objects;
create policy "auth delete own food photos" on storage.objects for delete to authenticated
using (bucket_id='food-photos' and (storage.foldername(name))[1]=auth.uid()::text);

-- 为下架、恢复和限制保留最小审计记录；原因仍仅下发给受影响用户本人。
create or replace function public.admin_set_item_visibility(p_item_id uuid, p_hidden boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid;
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if p_hidden and (p_reason is null or char_length(btrim(p_reason))<2 or not public.yffd_text_is_safe(p_reason)) then raise exception 'invalid_hidden_reason' using errcode='22023'; end if;
  update public.food_items set status=case when p_hidden then 'hidden' else 'published' end,
    hidden_reason=case when p_hidden then btrim(p_reason) else null end, hidden_at=case when p_hidden then now() else null end
  where id=p_item_id returning owner into v_owner;
  if not found then raise exception 'item_not_found' using errcode='P0002'; end if;
  insert into public.moderation_audit_log(actor_user_id,subject_user_id,action,target_type,target_id,reason)
  values(auth.uid(),v_owner,case when p_hidden then 'item_hidden' else 'item_restored' end,'item',p_item_id::text,case when p_hidden then btrim(p_reason) else null end);
  return jsonb_build_object('ok',true);
end; $$;

create or replace function public.admin_set_review_visibility(p_review_id uuid, p_hidden boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_owner uuid;
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if p_hidden and (p_reason is null or char_length(btrim(p_reason))<2 or not public.yffd_text_is_safe(p_reason)) then raise exception 'invalid_hidden_reason' using errcode='22023'; end if;
  update public.reviews set moderation_status=case when p_hidden then 'hidden' else 'published' end,
    moderation_reason=case when p_hidden then btrim(p_reason) else null end, moderated_at=case when p_hidden then now() else null end
  where id=p_review_id returning user_id into v_owner;
  if not found then raise exception 'review_not_found' using errcode='P0002'; end if;
  insert into public.moderation_audit_log(actor_user_id,subject_user_id,action,target_type,target_id,reason)
  values(auth.uid(),v_owner,case when p_hidden then 'review_hidden' else 'review_restored' end,'review',p_review_id::text,case when p_hidden then btrim(p_reason) else null end);
  return jsonb_build_object('ok',true);
end; $$;

create or replace function public.admin_set_profile_restriction(p_user_id uuid, p_restricted boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if p_restricted and p_user_id=auth.uid() then raise exception 'cannot_restrict_self' using errcode='22023'; end if;
  if p_restricted and (p_reason is null or char_length(btrim(p_reason))<2 or not public.yffd_text_is_safe(p_reason)) then raise exception 'invalid_restriction_reason' using errcode='22023'; end if;
  update public.profiles set moderation_status=case when p_restricted then 'restricted' else 'active' end,
    moderation_reason=case when p_restricted then btrim(p_reason) else null end, moderated_at=case when p_restricted then now() else null end
  where user_id=p_user_id;
  if not found then raise exception 'profile_not_found' using errcode='P0002'; end if;
  insert into public.moderation_audit_log(actor_user_id,subject_user_id,action,target_type,target_id,reason)
  values(auth.uid(),p_user_id,case when p_restricted then 'profile_restricted' else 'profile_restored' end,'profile',p_user_id::text,case when p_restricted then btrim(p_reason) else null end);
  return jsonb_build_object('ok',true);
end; $$;

-- 公开桶仍未改为私有签名访问前，不能把“数据库行删除”伪装成完整物理删除。
-- 停用前台可调用的 v3.6 RPC，常规治理一律使用可恢复的下架。
do $$ begin
  if to_regprocedure('public.admin_delete_item(uuid)') is not null then
    execute 'revoke all on function public.admin_delete_item(uuid) from authenticated';
  end if;
end $$;

grant execute on function public.my_food_items(), public.my_review(uuid), public.my_reviews(), public.my_profile() to authenticated;
grant execute on function public.admin_set_item_visibility(uuid,boolean,text), public.admin_set_review_visibility(uuid,boolean,text), public.admin_set_profile_restriction(uuid,boolean,text) to authenticated;
notify pgrst, 'reload schema';
