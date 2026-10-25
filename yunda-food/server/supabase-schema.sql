-- ============================================================
-- 云大饭搭子 · Supabase（Postgres + Storage）初始化脚本
-- 用法：Supabase 控制台 → SQL Editor → 粘贴本文件 → Run
-- 作用：建表 / 评论去重 RPC / 匿名读写安全策略 / 公开图片桶
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
  -- 预留：未来采集坐标前，一律不显示距离
  lat             double precision,
  lng             double precision
);

create index if not exists food_items_campus_idx on public.food_items (campus_id, status);
create index if not exists food_items_area_idx on public.food_items (area_id);

-- ---------- 评论 / 体验分表（同一 browser_id 对一条投稿仅一份） ----------
create table if not exists public.reviews (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.food_items(id) on delete cascade,
  browser_id  text not null,
  nickname    text not null check (char_length(nickname) between 1 and 16),
  rating      smallint not null check (rating between 1 and 5),
  text        text not null check (char_length(text) between 1 and 200),
  ate_date    text not null,
  created_at  timestamptz not null default now(),
  unique (item_id, browser_id)
);

create index if not exists reviews_item_idx on public.reviews (item_id);

-- ---------- 评论 upsert RPC（security definer，绕过逐条 RLS） ----------
create or replace function public.submit_review(
  p_item_id    uuid,
  p_browser_id text,
  p_nickname   text,
  p_rating     int,
  p_text       text,
  p_ate_date   text
)
returns public.reviews
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.reviews;
begin
  insert into public.reviews (item_id, browser_id, nickname, rating, text, ate_date)
  values (p_item_id, p_browser_id, p_nickname, p_rating, p_text, p_ate_date)
  on conflict (item_id, browser_id) do update
    set nickname = excluded.nickname,
        rating   = excluded.rating,
        text     = excluded.text,
        ate_date = excluded.ate_date,
        created_at = now()
  returning * into v_row;

  update public.food_items f
     set rating_count = sub.cnt,
         rating_avg   = sub.avg_rating
    from (
      select count(*) as cnt, avg(rating) as avg_rating
      from public.reviews where item_id = p_item_id
    ) sub
   where f.id = p_item_id;

  return v_row;
end;
$$;

-- ---------- 行级安全 ----------
alter table public.food_items enable row level security;
alter table public.reviews enable row level security;

-- 任何人可读已发布投稿；匿名可以投稿；匿名不能改/删（无 policy 即拒绝）
drop policy if exists "anon read published" on public.food_items;
create policy "anon read published"
  on public.food_items for select
  to anon
  using (status = 'published');

drop policy if exists "anon insert item" on public.food_items;
create policy "anon insert item"
  on public.food_items for insert
  to anon
  with check (source = 'user');

-- 任何人可读评论；写评论只允许通过 submit_review RPC（不放开表级 insert/update/delete）
drop policy if exists "anon read reviews" on public.reviews;
create policy "anon read reviews"
  on public.reviews for select
  to anon
  using (true);

grant execute on function public.submit_review(uuid, text, text, int, text, text) to anon;

-- ---------- 图片桶：food-photos（公开读，匿名仅允许上传到该桶） ----------
insert into storage.buckets (id, name, public)
values ('food-photos', 'food-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "public read food photos" on storage.objects;
create policy "public read food photos"
  on storage.objects for select
  to anon
  using (bucket_id = 'food-photos');

drop policy if exists "anon upload food photos" on storage.objects;
create policy "anon upload food photos"
  on storage.objects for insert
  to anon
  with check (
    bucket_id = 'food-photos'
    and storage.extension(name) in ('jpg', 'jpeg', 'png', 'webp')
  );
