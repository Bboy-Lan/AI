-- v3.2 修复：避免非 C locale 下中文范围表达式的非法排序范围。
-- [[:alnum:]] 是 PostgreSQL POSIX 字符类；与 _ / - 组合，服务器再次拦截空格、标点和敏感内容。
-- 可重复执行，不删除已有数据。

alter table public.profiles drop constraint if exists profiles_foodie_id_chars;
alter table public.profiles add constraint profiles_foodie_id_chars
  check (foodie_id ~ '^[[:alnum:]_-]+$');

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

notify pgrst, 'reload schema';
