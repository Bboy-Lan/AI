-- ============================================================
-- 云大饭搭子 · Supabase 初始化脚本（v2 · 2026-10-25）
-- 用法：Supabase 控制台 → SQL Editor → New query → 粘贴本文件 → Run
-- 本脚本可重复执行，不会删除或清空已有数据。
-- 已执行过 v1（2026-10-25 早些版本）也可直接跑本文件，或只跑
-- server/migrations/2026-10-25-v2-auth-and-feedback.sql（内容等价）。
--
-- 安全模型：
--   * 浏览（读投稿/评论/图片）：anon（未登录）与 authenticated（匿名登录后）均可
--   * 投稿、评分：必须先 Anonymous Sign-In（数据库角色为 authenticated）
--   * 所有写操作只允许通过 SECURITY DEFINER RPC，表本身不对访客开放写入
--   * 评分归属一律由 auth.uid() 决定，不接受客户端传入身份
--   * 评分数量/均分由数据库触发器计算，客户端无法写入或伪造
-- ============================================================

create extension if not exists pgcrypto;

-- ---------- 投稿表 ----------
create table if not exists public.food_items (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (char_length(name) between 2 and 30),
  category        text not null check (category in ('meal', 'snack', 'drink')),
  venue           text not null check (char_length(venue) between 2 and 40),
  area_id         text not null,
  campus_id       text not null,
  price_mode      text not null check (price_mode in ('per_item', 'per_person')),
  price           numeric(8, 2) not null check (price > 0 and price < 1000),
  spicy           smallint not null check (spicy between 0 and 3),
  sweet_salty     text not null check (sweet_salty in ('light', 'salty', 'sweet')),
  oil             text not null check (oil in ('less', 'normal', 'heavy')),
  staple          text check (staple is null or staple in ('noodle', 'rice')),
  flavors         text[] not null default '{}',
  cuisine         text,
  description     text not null check (char_length(description) between 5 and 200),
  image           text,
  source          text not null default 'user',
  status          text not null default 'published'
                    check (status in ('published', 'pending', 'hidden')),
  submitted_at    timestamptz not null default now(),
  price_updated_at date not null default current_date,
  author_nickname text not null check (char_length(author_nickname) between 1 and 16),
  author_hometown text,
  author_ate      boolean not null default false,
  author_ate_date text,
  rating_count    integer not null default 0,
  rating_avg      numeric(3, 2),
  -- 投稿归属（v2 新增）：仅数据库内部使用，不对访客查询开放
  owner           uuid references auth.users(id),
  -- 预留：未来采集坐标前，一律不显示距离
  lat             double precision,
  lng             double precision
);

-- v1 → v2 兼容：旧表补 owner 列
alter table public.food_items
  add column if not exists owner uuid references auth.users(id);

create index if not exists food_items_campus_idx on public.food_items (campus_id, status);
create index if not exists food_items_area_idx on public.food_items (area_id);

-- ---------- 评论 / 体验分表 ----------
-- v2：归属改为 auth.users。browser_id 为 v1 遗留列，保留但不再使用、不对外查询。
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.food_items(id) on delete cascade,
  user_id     uuid references auth.users(id),
  browser_id  text,
  nickname    text not null check (char_length(nickname) between 1 and 16),
  rating      smallint not null check (rating between 1 and 5),
  text        text not null check (char_length(text) between 1 and 200),
  ate_date    text not null,
  created_at  timestamptz not null default now()
);

alter table public.reviews add column if not exists user_id uuid references auth.users(id);
-- v1 中 browser_id 为 not null；v2 不再写入该列，需要放开
alter table public.reviews alter column browser_id drop not null;

-- 删除 v1 的 (item_id, browser_id) 唯一约束（若存在）
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.reviews'::regclass and contype = 'u'
  loop
    execute format('alter table public.reviews drop constraint %I', c.conname);
  end loop;
end $$;

-- 同一登录身份对一条投稿仅一份评价；历史遗留行 user_id 可为空，不参与唯一约束
create unique index if not exists reviews_item_user_uniq
  on public.reviews (item_id, user_id)
  where user_id is not null;
create index if not exists reviews_item_idx on public.reviews (item_id);

-- ---------- 价格纠错 / 举报反馈表（只进待处理队列，不自动覆盖原价） ----------
create table if not exists public.feedback (
  id              uuid primary key default gen_random_uuid(),
  type            text not null check (type in ('price_correction', 'report')),
  item_id         uuid not null references public.food_items(id) on delete cascade,
  reporter        uuid references auth.users(id), -- 允许为空：未登录访客也可反馈
  suggested_price numeric(8, 2) check (suggested_price is null or (suggested_price > 0 and suggested_price < 1000)),
  reason          text not null check (char_length(reason) between 2 and 200),
  status          text not null default 'pending'
                    check (status in ('pending', 'resolved', 'dismissed')),
  created_at      timestamptz not null default now(),
  -- 同一身份对同一投稿的同类反馈不要刷屏（未登录访客不受限）
  unique (item_id, reporter, type)
);
create index if not exists feedback_status_idx on public.feedback (status, created_at);

-- ============================================================
-- 评分聚合触发器：INSERT/UPDATE/DELETE 后重算该投稿的评分人数与均分
-- 行锁串行化同一投稿的并发评价，避免计数丢失
-- ============================================================
create or replace function public.recompute_item_ratings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_item uuid;
begin
  v_item := coalesce(new.item_id, old.item_id);
  update public.food_items f
     set rating_count = sub.cnt,
         rating_avg   = sub.avg_rating
    from (
      select count(*) as cnt, avg(rating) as avg_rating
      from public.reviews
      where item_id = v_item and user_id is not null
    ) sub
   where f.id = v_item;
  return null;
end;
$$;

drop trigger if exists reviews_ratings_aiud on public.reviews;
create trigger reviews_ratings_aiud
after insert or update or delete on public.reviews
for each row execute function public.recompute_item_ratings();

-- ============================================================
-- 写入 RPC（唯一的写入入口；search_path 固定；身份取 auth.uid()）
-- ============================================================

-- 投稿：只接收展示字段，统计/来源/状态/归属全部由服务端决定
create or replace function public.submit_food_item(
  p_name        text,
  p_category    text,
  p_venue       text,
  p_area_id     text,
  p_campus_id   text,
  p_price_mode  text,
  p_price       numeric,
  p_spicy       smallint,
  p_sweet_salty text,
  p_oil         text,
  p_staple      text,
  p_flavors     text[],
  p_cuisine     text,
  p_description text,
  p_image       text,
  p_nickname    text,
  p_hometown    text,
  p_ate         boolean,
  p_ate_date    text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.food_items;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  insert into public.food_items (
    name, category, venue, area_id, campus_id, price_mode, price,
    spicy, sweet_salty, oil, staple, flavors, cuisine, description, image,
    source, status, price_updated_at,
    author_nickname, author_hometown, author_ate, author_ate_date, owner
  ) values (
    p_name, p_category, p_venue, p_area_id, p_campus_id, p_price_mode, p_price,
    p_spicy, p_sweet_salty, p_oil, nullif(p_staple, '')::text, p_flavors, nullif(p_cuisine, ''), p_description, nullif(p_image, ''),
    'user', 'published', current_date,
    p_nickname, nullif(p_hometown, ''), coalesce(p_ate, false), nullif(p_ate_date, ''), v_uid
  )
  returning * into v_row;

  return to_jsonb(v_row) - 'owner' - 'lat' - 'lng';
end;
$$;

-- 评价：同身份覆盖旧评分（评价数量不重复增加，由触发器重算）
create or replace function public.submit_review(
  p_item_id  uuid,
  p_nickname text,
  p_rating   int,
  p_text     text,
  p_ate_date text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_row public.reviews;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select exists(select 1 from public.food_items where id = p_item_id and status = 'published') into v_exists;
  if not v_exists then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;

  insert into public.reviews (item_id, user_id, nickname, rating, text, ate_date)
  values (p_item_id, v_uid, p_nickname, p_rating, p_text, p_ate_date)
  on conflict (item_id, user_id) where user_id is not null do
  update
    set nickname  = excluded.nickname,
        rating    = excluded.rating,
        text      = excluded.text,
        ate_date  = excluded.ate_date,
        created_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'item_id', v_row.item_id,
    'nickname', v_row.nickname,
    'rating', v_row.rating,
    'text', v_row.text,
    'ate_date', v_row.ate_date,
    'created_at', v_row.created_at
  );
end;
$$;

-- 价格纠错 / 举报：未登录也可提交；强制 pending，不改动原投稿
create or replace function public.submit_feedback(
  p_item_id         uuid,
  p_type            text,
  p_suggested_price numeric,
  p_reason          text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exists boolean;
  v_row public.feedback;
begin
  select exists(select 1 from public.food_items where id = p_item_id and status = 'published') into v_exists;
  if not v_exists then
    raise exception 'item_not_found' using errcode = 'P0002';
  end if;

  insert into public.feedback (type, item_id, reporter, suggested_price, reason, status)
  values (
    p_type,
    p_item_id,
    auth.uid(),   -- 未登录时为 null，合理
    case when p_type = 'price_correction' then p_suggested_price else null end,
    p_reason,
    'pending'
  )
  on conflict (item_id, reporter, type)
  do update set
    suggested_price = excluded.suggested_price,
    reason          = excluded.reason,
    status          = 'pending',
    created_at      = now()
  returning * into v_row;

  return jsonb_build_object('ok', true, 'id', v_row.id);
end;
$$;

-- 旧版可被任意身份冒写的 RPC：立即移除
drop function if exists public.submit_review(uuid, text, text, int, text, text);

-- 函数执行权限：默认不给 public，按角色最小授权
revoke all on function public.submit_food_item(text,text,text,text,text,text,numeric,smallint,text,text,text,text[],text,text,text,text,text,boolean,text) from public;
revoke all on function public.submit_review(uuid, text, int, text, text) from public;
revoke all on function public.submit_feedback(uuid, text, numeric, text) from public;
revoke all on function public.recompute_item_ratings() from public;

grant execute on function public.submit_food_item(text,text,text,text,text,text,numeric,smallint,text,text,text,text[],text,text,text,text,text,boolean,text) to authenticated;
grant execute on function public.submit_review(uuid, text, int, text, text) to authenticated;
grant execute on function public.submit_feedback(uuid, text, numeric, text) to anon, authenticated;

-- ============================================================
-- 行级安全
-- ============================================================
alter table public.food_items enable row level security;
alter table public.reviews enable row level security;
alter table public.feedback enable row level security;

-- 投稿/评论/反馈：无任何表级 insert/update/delete policy，
-- 访客（含 authenticated）无法直接改表，只能调用上面的 RPC。
drop policy if exists "read published items" on public.food_items;
create policy "read published items"
  on public.food_items for select
  to anon, authenticated
  using (status = 'published');

-- 删除 v1 遗留的“任何人可直接插表”策略：所有写入只允许走 RPC
drop policy if exists "anon insert item" on public.food_items;
drop policy if exists "anon read published" on public.food_items;
drop policy if exists "anon read reviews" on public.reviews;

drop policy if exists "read reviews" on public.reviews;
create policy "read reviews"
  on public.reviews for select
  to anon, authenticated
  using (true);
-- feedback 对访客完全不可读（无 select policy），项目所有者在 SQL 控制台处理

-- 列级权限：公开查询不返回 owner（避免暴露可用于冒改的身份字段）
revoke all on public.food_items from anon, authenticated;
grant select (
  id, name, category, venue, area_id, campus_id, price_mode, price,
  spicy, sweet_salty, oil, staple, flavors, cuisine, description, image,
  source, status, submitted_at, price_updated_at,
  author_nickname, author_hometown, author_ate, author_ate_date,
  rating_count, rating_avg
) on public.food_items to anon, authenticated;

revoke all on public.reviews from anon, authenticated;
grant select (id, item_id, nickname, rating, text, ate_date, created_at)
  on public.reviews to anon, authenticated;

-- feedback 不对 anon/authenticated 授权（读写都走 RPC，读取仅所有者控制台）

-- ============================================================
-- Storage：food-photos 桶
--   * 公开读（anon + authenticated）
--   * 仅匿名登录用户可写，且只能写自己 uid 目录：<uid>/<文件名>
--   * 扩展名白名单；浏览器端先压缩到 ≤1280px JPEG（约几百 KB）
-- ============================================================
insert into storage.buckets (id, name, public)
values ('food-photos', 'food-photos', true)
on conflict (id) do update set public = true;

-- 服务端硬限制：仅图片 MIME、单文件 ≤ 8MB（浏览器端还会先压缩）
update storage.buckets
   set file_size_limit = 8388608,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'food-photos';

drop policy if exists "public read food photos" on storage.objects;
create policy "public read food photos"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'food-photos');

drop policy if exists "auth upload own food photos" on storage.objects;
create policy "auth upload own food photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'food-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

drop policy if exists "auth update own food photos" on storage.objects;
create policy "auth update own food photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'food-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'food-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp')
  );

-- 删除旧的“任意匿名可传”策略（v1）
drop policy if exists "anon upload food photos" on storage.objects;
