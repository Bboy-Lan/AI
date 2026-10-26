-- 云大饭搭子 v3：可信匿名身份、地点核验、想吃榜与软下架。
-- 在 Supabase SQL Editor 整段执行；只新增字段/策略/RPC，不删除已有投稿、图片或评分。
-- auth.uid() 是唯一可信用户标识；所有 p_* 仅是内容，不接受客户端 user_id。

create extension if not exists pgcrypto;

-- 明显不当内容的保守拦截。它不是替代人工审核的“万能敏感词库”，
-- 但前端和 RPC 都会调用/复现同一最小规则，避免无校验写入。
create or replace function public.yffd_text_is_safe(p_text text)
returns boolean language sql immutable as $$
  select coalesce(
    char_length(btrim(p_text)) > 0
    and p_text !~* '(操你|傻逼|妈的|去死|强奸|裸聊|色情|成人视频|代办学位|博彩|赌博|毒品)', false);
$$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  foodie_id text not null unique,
  hometown text,
  taste_preferences jsonb not null default '{}'::jsonb,
  default_area_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_foodie_id_length check (char_length(foodie_id) between 2 and 16),
  constraint profiles_foodie_id_chars check (foodie_id ~ '^[[:alnum:]_-]+$')
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.food_items
  add column if not exists place_id text,
  add column if not exists place_key text,
  add column if not exists address_summary text,
  add column if not exists verification_status text not null default 'pending',
  add column if not exists verification_positive_count integer not null default 0,
  add column if not exists verification_negative_count integer not null default 0,
  add column if not exists verification_rating_count integer not null default 0,
  add column if not exists favorite_count integer not null default 0,
  add column if not exists hidden_reason text,
  add column if not exists hidden_at timestamptz;

-- 旧数据按“地点 + 具体店”生成受控键；没有坐标仍绝不参与附近排序。
update public.food_items
set place_key = coalesce(place_key, lower(regexp_replace(coalesce(area_id, '') || '|' || coalesce(venue, ''), '\s+', '', 'g')))
where place_key is null;

alter table public.food_items drop constraint if exists food_items_sweet_salty_check;
alter table public.food_items add constraint food_items_sweet_salty_check
  check (sweet_salty in ('light', 'normal', 'salty', 'sweet'));
alter table public.food_items add constraint food_items_verification_status_check
  check (verification_status in ('pending', 'verified')) not valid;
alter table public.food_items validate constraint food_items_verification_status_check;
alter table public.food_items add constraint food_items_hidden_reason_length
  check (hidden_reason is null or char_length(hidden_reason) between 2 and 120) not valid;
alter table public.food_items validate constraint food_items_hidden_reason_length;
create index if not exists food_items_place_key_idx on public.food_items(place_key, status);

create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id uuid not null references public.food_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
create index if not exists favorites_item_idx on public.favorites(item_id);

create or replace function public.recompute_item_favorites()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_item uuid := coalesce(new.item_id, old.item_id);
begin
  update public.food_items set favorite_count = (select count(*) from public.favorites where item_id = v_item) where id = v_item;
  return null;
end; $$;
drop trigger if exists favorites_count_aiud on public.favorites;
create trigger favorites_count_aiud after insert or delete on public.favorites
for each row execute function public.recompute_item_favorites();

-- 仅计算“不同、非投稿作者”的真实身份评分；同一 user_id 的覆盖天然只有一行。
create or replace function public.recompute_place_verification(p_item uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_key text; v_positive integer; v_negative integer; v_total integer; v_verified text;
begin
  select place_key into v_key from public.food_items where id = p_item;
  if v_key is null then return; end if;
  select
    count(*) filter (where r.rating >= 4),
    count(*) filter (where r.rating <= 2),
    count(*)
  into v_positive, v_negative, v_total
  from public.reviews r join public.food_items i on i.id = r.item_id
  where i.place_key = v_key and r.user_id is not null
    and r.user_id not in (select owner from public.food_items where place_key = v_key and owner is not null);
  v_verified := case when v_positive >= 2 and v_positive > v_negative * 2 then 'verified' else 'pending' end;
  update public.food_items set
    verification_positive_count = coalesce(v_positive, 0),
    verification_negative_count = coalesce(v_negative, 0),
    verification_rating_count = coalesce(v_total, 0),
    verification_status = v_verified
  where place_key = v_key;
end; $$;

create or replace function public.recompute_item_ratings()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_item uuid := coalesce(new.item_id, old.item_id);
begin
  update public.food_items f set rating_count = q.cnt, rating_avg = q.avg_rating
  from (select count(*) cnt, avg(rating) avg_rating from public.reviews where item_id = v_item and user_id is not null) q
  where f.id = v_item;
  perform public.recompute_place_verification(v_item);
  return null;
end; $$;

-- 将已有评分纳入新地点核验计数；不改动任何原始评论。
do $$ declare r record; begin
  for r in select id from public.food_items loop
    perform public.recompute_place_verification(r.id);
  end loop;
end $$;

-- 仅 auth.uid() 本人可创建/更新自己的 profile；内容及格式由服务端再次校验。
create or replace function public.upsert_my_profile(p_foodie_id text, p_hometown text, p_taste_preferences jsonb, p_default_area_id text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_row public.profiles;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  if p_foodie_id !~ '^[[:alnum:]_-]+$' or char_length(p_foodie_id) not between 2 and 16 or not public.yffd_text_is_safe(p_foodie_id) then
    raise exception 'invalid_foodie_id' using errcode = '22023';
  end if;
  insert into public.profiles(user_id, foodie_id, hometown, taste_preferences, default_area_id)
  values(v_uid, btrim(p_foodie_id), nullif(btrim(p_hometown), ''), coalesce(p_taste_preferences, '{}'::jsonb), nullif(btrim(p_default_area_id), ''))
  on conflict(user_id) do update set foodie_id=excluded.foodie_id, hometown=excluded.hometown,
    taste_preferences=excluded.taste_preferences, default_area_id=excluded.default_area_id, updated_at=now()
  returning * into v_row;
  return jsonb_build_object('foodie_id', v_row.foodie_id, 'hometown', v_row.hometown, 'default_area_id', v_row.default_area_id);
exception when unique_violation then raise exception 'foodie_id_taken' using errcode = '23505';
end; $$;

create or replace function public.my_profile()
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid := auth.uid(); v_row public.profiles;
begin
  if v_uid is null then return null; end if;
  select * into v_row from public.profiles where user_id=v_uid;
  if not found then return null; end if;
  return jsonb_build_object('foodie_id',v_row.foodie_id,'hometown',v_row.hometown,'taste_preferences',v_row.taste_preferences,'default_area_id',v_row.default_area_id);
end; $$;

-- 新函数：内容作者名完全取 profiles，不接受 caller 传入 user_id 或显示名。
create or replace function public.submit_food_item_v3(
  p_name text, p_category text, p_venue text, p_area_id text, p_campus_id text, p_price_mode text, p_price numeric,
  p_spicy smallint, p_sweet_salty text, p_oil text, p_staple text, p_flavors text[], p_cuisine text,
  p_description text, p_image text, p_place_id text default null, p_lat double precision default null,
  p_lng double precision default null, p_address_summary text default null)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid:=auth.uid(); v_profile public.profiles; v_row public.food_items; v_place_key text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  select * into v_profile from public.profiles where user_id=v_uid;
  if not found then raise exception 'profile_required' using errcode='P0001'; end if;
  if not public.yffd_text_is_safe(p_name) or not public.yffd_text_is_safe(p_venue) or not public.yffd_text_is_safe(p_description) then
    raise exception 'unsafe_content' using errcode='22023';
  end if;
  if p_price is null or p_price <= 0 or p_price >= 1000 then raise exception 'invalid_price' using errcode='22023'; end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then raise exception 'invalid_latitude' using errcode='22023'; end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then raise exception 'invalid_longitude' using errcode='22023'; end if;
  v_place_key := case when nullif(btrim(p_place_id),'') is not null then 'pid:'||btrim(p_place_id)
                      else lower(regexp_replace(btrim(p_area_id)||'|'||btrim(p_venue), '\s+', '', 'g')) end;
  insert into public.food_items(name,category,venue,area_id,campus_id,price_mode,price,spicy,sweet_salty,oil,staple,flavors,cuisine,description,image,
    source,status,price_updated_at,author_nickname,author_hometown,author_ate,owner,place_id,place_key,lat,lng,address_summary)
  values(btrim(p_name),p_category,btrim(p_venue),btrim(p_area_id),btrim(p_campus_id),p_price_mode,p_price,p_spicy,p_sweet_salty,p_oil,nullif(p_staple,''),coalesce(p_flavors,'{}'),nullif(p_cuisine,''),btrim(p_description),nullif(p_image,''),
    'user','published',current_date,v_profile.foodie_id,v_profile.hometown,false,v_uid,nullif(btrim(p_place_id),''),v_place_key,p_lat,p_lng,nullif(btrim(p_address_summary),''))
  returning * into v_row;
  return to_jsonb(v_row) - 'owner';
end; $$;

create or replace function public.submit_review_v3(p_item_id uuid, p_rating int, p_text text, p_ate_date text)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_uid uuid:=auth.uid(); v_profile public.profiles; v_item public.food_items; v_row public.reviews;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  select * into v_profile from public.profiles where user_id=v_uid; if not found then raise exception 'profile_required' using errcode='P0001'; end if;
  select * into v_item from public.food_items where id=p_item_id and status='published'; if not found then raise exception 'item_not_found' using errcode='P0002'; end if;
  if v_item.owner = v_uid then raise exception 'author_cannot_rate' using errcode='42501'; end if;
  if p_rating not between 1 and 5 or not public.yffd_text_is_safe(p_text) then raise exception 'invalid_review' using errcode='22023'; end if;
  insert into public.reviews(item_id,user_id,nickname,rating,text,ate_date) values(p_item_id,v_uid,v_profile.foodie_id,p_rating,btrim(p_text),p_ate_date)
  on conflict(item_id,user_id) where user_id is not null do update set nickname=excluded.nickname,rating=excluded.rating,text=excluded.text,ate_date=excluded.ate_date,created_at=now()
  returning * into v_row;
  return jsonb_build_object('id',v_row.id,'item_id',v_row.item_id,'nickname',v_row.nickname,'rating',v_row.rating,'text',v_row.text,'ate_date',v_row.ate_date,'created_at',v_row.created_at);
end; $$;

create or replace function public.toggle_favorite(p_item_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid:=auth.uid(); v_saved boolean;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  if not exists(select 1 from public.food_items where id=p_item_id and status='published') then raise exception 'item_not_found' using errcode='P0002'; end if;
  delete from public.favorites where user_id=v_uid and item_id=p_item_id;
  if found then return jsonb_build_object('saved',false); end if;
  insert into public.favorites(user_id,item_id) values(v_uid,p_item_id); return jsonb_build_object('saved',true);
end; $$;

create or replace function public.my_favorite_ids()
returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(item_id), '[]'::jsonb) from public.favorites where user_id=auth.uid(); $$;

create or replace function public.my_reviews()
returns jsonb language sql security definer set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'item_id',item_id,'nickname',nickname,'rating',rating,'text',text,'ate_date',ate_date,'created_at',created_at) order by created_at desc), '[]'::jsonb)
 from public.reviews where user_id=auth.uid(); $$;

create or replace function public.is_admin()
returns boolean language sql security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.admin_users where user_id=auth.uid()); $$;

create or replace function public.admin_set_item_visibility(p_item_id uuid, p_hidden boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if p_hidden and (p_reason is null or char_length(btrim(p_reason)) < 2 or not public.yffd_text_is_safe(p_reason)) then raise exception 'invalid_hidden_reason' using errcode='22023'; end if;
  update public.food_items set status=case when p_hidden then 'hidden' else 'published' end,
    hidden_reason=case when p_hidden then btrim(p_reason) else null end, hidden_at=case when p_hidden then now() else null end
  where id=p_item_id;
  if not found then raise exception 'item_not_found' using errcode='P0002'; end if;
  return jsonb_build_object('ok',true);
end; $$;

-- RPC 权限：普通用户没有表级写权限；管理员身份只能由数据库 admin_users 安全配置。
revoke all on public.profiles, public.favorites, public.admin_users from anon, authenticated;
revoke all on function public.upsert_my_profile(text,text,jsonb,text), public.my_profile(), public.submit_food_item_v3(text,text,text,text,text,text,numeric,smallint,text,text,text,text[],text,text,text,text,double precision,double precision,text), public.submit_review_v3(uuid,int,text,text), public.toggle_favorite(uuid), public.my_favorite_ids(), public.my_reviews(), public.is_admin(), public.admin_set_item_visibility(uuid,boolean,text) from public;
grant execute on function public.upsert_my_profile(text,text,jsonb,text), public.my_profile(), public.submit_food_item_v3(text,text,text,text,text,text,numeric,smallint,text,text,text,text[],text,text,text,text,double precision,double precision,text), public.submit_review_v3(uuid,int,text,text), public.toggle_favorite(uuid), public.my_favorite_ids(), public.my_reviews(), public.is_admin() to authenticated;
grant execute on function public.admin_set_item_visibility(uuid,boolean,text) to authenticated;
grant select(id,name,category,venue,area_id,campus_id,price_mode,price,spicy,sweet_salty,oil,staple,flavors,cuisine,description,image,source,status,submitted_at,price_updated_at,author_nickname,author_hometown,author_ate,author_ate_date,rating_count,rating_avg,place_id,place_key,address_summary,verification_status,verification_positive_count,verification_negative_count,verification_rating_count,favorite_count,lat,lng,hidden_reason,hidden_at) on public.food_items to anon, authenticated;

notify pgrst, 'reload schema';

