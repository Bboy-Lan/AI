-- v3.9：投稿大致坐标 + 作者事后补充/更正。依赖 v3.8。
-- 不修改审核状态、评分或归属；只能由 owner=auth.uid() 的作者调用。

create or replace function public.my_food_items()
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(x) - 'owner' order by x.submitted_at desc)
    from (select * from public.food_items where owner=v_uid and source='user') x
  ), '[]'::jsonb);
end; $$;

create or replace function public.update_my_food_item_v3(
  p_item_id uuid, p_name text, p_category text, p_venue text, p_area_id text,
  p_price_mode text, p_price numeric, p_spicy smallint, p_sweet_salty text,
  p_oil text, p_staple text, p_flavors text[], p_description text,
  p_image text default null, p_lat double precision default null, p_lng double precision default null
)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_uid uuid := auth.uid(); v_old public.food_items; v_row public.food_items;
  v_old_anchor uuid; v_new_key text;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode='28000'; end if;
  select * into v_old from public.food_items where id=p_item_id and owner=v_uid and source='user';
  if not found then raise exception 'item_not_owned' using errcode='42501'; end if;
  if p_category not in ('meal','snack','drink') or p_price_mode not in ('per_item','per_person') then raise exception 'invalid_item' using errcode='22023'; end if;
  if p_area_id not in ('ynu-chenggong','ynu-donglu','university-town','chenggong','wuhua','panlong','xishan','guandu','jinning','anning','zhweitang','yuweitang','shilinjie','nandu') then raise exception 'location_outside_kunming' using errcode='22023'; end if;
  if char_length(btrim(p_name))<2 or char_length(btrim(p_venue))<2 or char_length(btrim(p_description))<5 then raise exception 'invalid_item' using errcode='22023'; end if;
  if not public.yffd_text_is_safe(p_name) or not public.yffd_text_is_safe(p_venue) or not public.yffd_text_is_safe(p_description) then raise exception 'unsafe_content' using errcode='22023'; end if;
  if p_price is null or p_price<=0 or p_price>=1000 then raise exception 'invalid_price' using errcode='22023'; end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then raise exception 'invalid_latitude' using errcode='22023'; end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then raise exception 'invalid_longitude' using errcode='22023'; end if;
  v_new_key := lower(regexp_replace(btrim(p_area_id)||'|'||btrim(p_venue),'\s+','','g'));

  update public.food_items set
    name=btrim(p_name), category=p_category, venue=btrim(p_venue), area_id=btrim(p_area_id), campus_id='kunming',
    price_mode=p_price_mode, price=p_price, spicy=p_spicy, sweet_salty=p_sweet_salty, oil=p_oil,
    staple=nullif(p_staple,''), flavors=coalesce(p_flavors,'{}'), description=btrim(p_description),
    image=coalesce(nullif(btrim(p_image),''), image), place_key=v_new_key,
    lat=coalesce(p_lat,lat), lng=coalesce(p_lng,lng),
    price_updated_at=case when price is distinct from p_price then current_date else price_updated_at end
  where id=p_item_id returning * into v_row;

  perform public.recompute_place_verification(p_item_id);
  if v_old.place_key is distinct from v_new_key then
    select id into v_old_anchor from public.food_items where place_key=v_old.place_key and id<>p_item_id limit 1;
    if v_old_anchor is not null then perform public.recompute_place_verification(v_old_anchor); end if;
  end if;
  return to_jsonb(v_row) - 'owner';
end; $$;

grant execute on function public.my_food_items(), public.update_my_food_item_v3(uuid,text,text,text,text,text,numeric,smallint,text,text,text,text[],text,text,double precision,double precision) to authenticated;
notify pgrst, 'reload schema';
