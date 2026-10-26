-- 云大饭搭子 v3.4：管理员二次人工审核与浏览器身份授权
-- 依赖已执行的 v3 / v3.3。只新增审核字段与 RPC，不删除投稿、评论或用户资料。
-- 所有管理员 RPC 在数据库内再次校验 admin_users + auth.uid()；前端按钮不构成权限。

alter table public.reviews add column if not exists moderation_status text not null default 'published';
alter table public.reviews add column if not exists moderation_reason text;
alter table public.reviews add column if not exists moderated_at timestamptz;
alter table public.reviews drop constraint if exists reviews_moderation_status_check;
alter table public.reviews add constraint reviews_moderation_status_check check (moderation_status in ('published', 'hidden'));

alter table public.profiles add column if not exists moderation_status text not null default 'active';
alter table public.profiles add column if not exists moderation_reason text;
alter table public.profiles add column if not exists moderated_at timestamptz;
alter table public.profiles drop constraint if exists profiles_moderation_status_check;
alter table public.profiles add constraint profiles_moderation_status_check check (moderation_status in ('active', 'restricted'));

create index if not exists reviews_moderation_status_idx on public.reviews (moderation_status, created_at desc);
create index if not exists profiles_moderation_status_idx on public.profiles (moderation_status, created_at desc);

-- 隐藏评论后，统计与地点核验都必须剔除该评论。
create or replace function public.recompute_place_verification(p_item uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_key text; v_positive int; v_negative int; v_total int; v_verified text;
begin
  select place_key into v_key from public.food_items where id = p_item;
  if v_key is null then return; end if;
  select count(*) filter (where r.rating >= 4), count(*) filter (where r.rating <= 2), count(*)
    into v_positive, v_negative, v_total
  from public.reviews r join public.food_items i on i.id = r.item_id
  where i.place_key = v_key and r.user_id is not null and r.moderation_status = 'published'
    and r.user_id not in (select owner from public.food_items where place_key = v_key and owner is not null);
  v_verified := case when v_positive >= 2 and v_positive > v_negative * 2 then 'verified' else 'pending' end;
  update public.food_items set verification_positive_count=coalesce(v_positive,0), verification_negative_count=coalesce(v_negative,0),
    verification_rating_count=coalesce(v_total,0), verification_status=v_verified where place_key=v_key;
end; $$;

create or replace function public.recompute_item_ratings()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_item uuid := coalesce(new.item_id, old.item_id);
begin
  update public.food_items f set rating_count=q.cnt, rating_avg=q.avg_rating
  from (select count(*) cnt, avg(rating) avg_rating from public.reviews where item_id=v_item and user_id is not null and moderation_status='published') q
  where f.id=v_item;
  perform public.recompute_place_verification(v_item);
  return null;
end; $$;

-- 受限制的用户仍可修改吃货 ID，但不能继续发布投稿或评论。
create or replace function public.submit_food_item_v3(
  p_name text, p_category text, p_venue text, p_area_id text, p_campus_id text, p_price_mode text, p_price numeric,
  p_spicy smallint, p_sweet_salty text, p_oil text, p_staple text, p_flavors text[], p_cuisine text,
  p_description text, p_image text, p_place_id text default null, p_lat double precision default null,
  p_lng double precision default null, p_address_summary text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_profile public.profiles; v_row public.food_items; v_place_key text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  select * into v_profile from public.profiles where user_id=v_uid;
  if not found then raise exception 'profile_required' using errcode='P0001'; end if;
  if v_profile.moderation_status = 'restricted' then raise exception 'profile_restricted' using errcode='42501'; end if;
  if not public.yffd_text_is_safe(p_name) or not public.yffd_text_is_safe(p_venue) or not public.yffd_text_is_safe(p_description) then raise exception 'unsafe_content' using errcode='22023'; end if;
  if p_price is null or p_price <= 0 or p_price >= 1000 then raise exception 'invalid_price' using errcode='22023'; end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then raise exception 'invalid_latitude' using errcode='22023'; end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then raise exception 'invalid_longitude' using errcode='22023'; end if;
  v_place_key := case when nullif(btrim(p_place_id),'') is not null then 'pid:'||btrim(p_place_id) else lower(regexp_replace(btrim(p_area_id)||'|'||btrim(p_venue), '\s+', '', 'g')) end;
  insert into public.food_items(name,category,venue,area_id,campus_id,price_mode,price,spicy,sweet_salty,oil,staple,flavors,cuisine,description,image,source,status,price_updated_at,author_nickname,author_hometown,author_ate,owner,place_id,place_key,lat,lng,address_summary)
  values(btrim(p_name),p_category,btrim(p_venue),btrim(p_area_id),btrim(p_campus_id),p_price_mode,p_price,p_spicy,p_sweet_salty,p_oil,nullif(p_staple,''),coalesce(p_flavors,'{}'),nullif(p_cuisine,''),btrim(p_description),nullif(p_image,''),'user','published',current_date,v_profile.foodie_id,v_profile.hometown,false,v_uid,nullif(btrim(p_place_id),''),v_place_key,p_lat,p_lng,nullif(btrim(p_address_summary),''))
  returning * into v_row;
  return to_jsonb(v_row) - 'owner';
end; $$;

create or replace function public.submit_review_v3(p_item_id uuid, p_rating int, p_text text, p_ate_date text)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_profile public.profiles; v_item public.food_items; v_row public.reviews;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  select * into v_profile from public.profiles where user_id=v_uid; if not found then raise exception 'profile_required' using errcode='P0001'; end if;
  if v_profile.moderation_status = 'restricted' then raise exception 'profile_restricted' using errcode='42501'; end if;
  select * into v_item from public.food_items where id=p_item_id and status='published'; if not found then raise exception 'item_not_found' using errcode='P0002'; end if;
  if v_item.owner = v_uid then raise exception 'author_cannot_rate' using errcode='42501'; end if;
  if p_rating not between 1 and 5 or not public.yffd_text_is_safe(p_text) then raise exception 'invalid_review' using errcode='22023'; end if;
  insert into public.reviews(item_id,user_id,nickname,rating,text,ate_date) values(p_item_id,v_uid,v_profile.foodie_id,p_rating,btrim(p_text),p_ate_date)
  on conflict(item_id,user_id) where user_id is not null do update set nickname=excluded.nickname,rating=excluded.rating,text=excluded.text,ate_date=excluded.ate_date,created_at=now()
  returning * into v_row;
  return jsonb_build_object('id',v_row.id,'item_id',v_row.item_id,'nickname',v_row.nickname,'rating',v_row.rating,'text',v_row.text,'ate_date',v_row.ate_date,'created_at',v_row.created_at);
end; $$;

-- 普通读取只会得到在架评论；管理员通过下方专用 RPC 查看被隐藏内容。
drop policy if exists "read reviews" on public.reviews;
drop policy if exists "read published reviews" on public.reviews;
create policy "read published reviews" on public.reviews for select to anon, authenticated using (moderation_status = 'published');
revoke all on public.reviews from anon, authenticated;
grant select (id,item_id,nickname,rating,text,ate_date,created_at,moderation_status) on public.reviews to anon, authenticated;

create or replace function public.admin_moderation_overview()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  return jsonb_build_object(
    'profile_count',(select count(*) from public.profiles),
    'published_item_count',(select count(*) from public.food_items where status='published' and source='user'),
    'hidden_item_count',(select count(*) from public.food_items where status='hidden' and source='user'),
    'published_review_count',(select count(*) from public.reviews where moderation_status='published'),
    'hidden_review_count',(select count(*) from public.reviews where moderation_status='hidden')
  );
end; $$;

create or replace function public.admin_list_reviews(p_include_hidden boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'item_id',r.item_id,'item_name',f.name,'nickname',r.nickname,'rating',r.rating,'text',r.text,'ate_date',r.ate_date,'created_at',r.created_at,'moderation_status',r.moderation_status,'moderation_reason',r.moderation_reason) order by r.created_at desc),'[]'::jsonb)
    from public.reviews r join public.food_items f on f.id=r.item_id where r.moderation_status = case when p_include_hidden then 'hidden' else 'published' end);
end; $$;

create or replace function public.admin_set_review_visibility(p_review_id uuid, p_hidden boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if p_hidden and (p_reason is null or char_length(btrim(p_reason)) < 2 or not public.yffd_text_is_safe(p_reason)) then raise exception 'invalid_hidden_reason' using errcode='22023'; end if;
  update public.reviews set moderation_status=case when p_hidden then 'hidden' else 'published' end, moderation_reason=case when p_hidden then btrim(p_reason) else null end, moderated_at=case when p_hidden then now() else null end where id=p_review_id;
  if not found then raise exception 'review_not_found' using errcode='P0002'; end if;
  return jsonb_build_object('ok',true);
end; $$;

create or replace function public.admin_list_profiles()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('user_id',p.user_id,'foodie_id',p.foodie_id,'hometown',p.hometown,'default_area_id',p.default_area_id,'created_at',p.created_at,'item_count',(select count(*) from public.food_items f where f.owner=p.user_id and f.source='user'),'review_count',(select count(*) from public.reviews r where r.user_id=p.user_id),'moderation_status',p.moderation_status,'moderation_reason',p.moderation_reason) order by p.created_at desc),'[]'::jsonb) from public.profiles p);
end; $$;

create or replace function public.admin_set_profile_restriction(p_user_id uuid, p_restricted boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if p_restricted and p_user_id=auth.uid() then raise exception 'cannot_restrict_self' using errcode='22023'; end if;
  if p_restricted and (p_reason is null or char_length(btrim(p_reason)) < 2 or not public.yffd_text_is_safe(p_reason)) then raise exception 'invalid_restriction_reason' using errcode='22023'; end if;
  update public.profiles set moderation_status=case when p_restricted then 'restricted' else 'active' end, moderation_reason=case when p_restricted then btrim(p_reason) else null end, moderated_at=case when p_restricted then now() else null end where user_id=p_user_id;
  if not found then raise exception 'profile_not_found' using errcode='P0002'; end if;
  return jsonb_build_object('ok',true);
end; $$;

-- 匿名会话按浏览器存储；现有管理员可明确授权另一浏览器的已初始化身份，不能由普通用户自授予。
create or replace function public.admin_grant_device(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if not exists(select 1 from public.profiles where user_id=p_user_id) then raise exception 'profile_not_found' using errcode='P0002'; end if;
  insert into public.admin_users(user_id) values(p_user_id) on conflict(user_id) do nothing;
  return jsonb_build_object('ok',true);
end; $$;

revoke all on function public.admin_moderation_overview(), public.admin_list_reviews(boolean), public.admin_set_review_visibility(uuid,boolean,text), public.admin_list_profiles(), public.admin_set_profile_restriction(uuid,boolean,text), public.admin_grant_device(uuid) from public;
grant execute on function public.admin_moderation_overview(), public.admin_list_reviews(boolean), public.admin_set_review_visibility(uuid,boolean,text), public.admin_list_profiles(), public.admin_set_profile_restriction(uuid,boolean,text), public.admin_grant_device(uuid) to authenticated;
notify pgrst, 'reload schema';
