-- v3.8：公开地点范围统一为昆明市。依赖 v3.4/v3.7。
-- 仅迁移本项目既有的昆明范围标识；不改动用户自填的 default_area_id 或家乡信息。
update public.food_items
set campus_id = 'kunming'
where campus_id in ('ynu-chenggong', 'ynu-donglu', 'other-kunming');

-- 所有新投稿只能使用前端提供的昆明市具体地点，避免绕过界面写入非昆明范围。
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
  if v_profile.moderation_status='restricted' then raise exception 'profile_restricted' using errcode='42501'; end if;
  if p_campus_id <> 'kunming' or p_area_id not in ('ynu-chenggong','ynu-donglu','university-town','chenggong','wuhua','panlong','xishan','guandu','jinning','anning','zhweitang','yuweitang','shilinjie','nandu') then
    raise exception 'location_outside_kunming' using errcode='22023';
  end if;
  if not public.yffd_text_is_safe(p_name) or not public.yffd_text_is_safe(p_venue) or not public.yffd_text_is_safe(p_description) then raise exception 'unsafe_content' using errcode='22023'; end if;
  if p_price is null or p_price<=0 or p_price>=1000 then raise exception 'invalid_price' using errcode='22023'; end if;
  if p_lat is not null and (p_lat < -90 or p_lat > 90) then raise exception 'invalid_latitude' using errcode='22023'; end if;
  if p_lng is not null and (p_lng < -180 or p_lng > 180) then raise exception 'invalid_longitude' using errcode='22023'; end if;
  v_place_key:=case when nullif(btrim(p_place_id),'') is not null then 'pid:'||btrim(p_place_id) else lower(regexp_replace(btrim(p_area_id)||'|'||btrim(p_venue),'\s+','','g')) end;
  insert into public.food_items(name,category,venue,area_id,campus_id,price_mode,price,spicy,sweet_salty,oil,staple,flavors,cuisine,description,image,source,status,price_updated_at,author_nickname,author_hometown,author_ate,owner,place_id,place_key,lat,lng,address_summary)
  values(btrim(p_name),p_category,btrim(p_venue),btrim(p_area_id),'kunming',p_price_mode,p_price,p_spicy,p_sweet_salty,p_oil,nullif(p_staple,''),coalesce(p_flavors,'{}'),nullif(p_cuisine,''),btrim(p_description),nullif(p_image,''),'user','published',current_date,v_profile.foodie_id,v_profile.hometown,false,v_uid,nullif(btrim(p_place_id),''),v_place_key,p_lat,p_lng,nullif(btrim(p_address_summary),''))
  returning * into v_row;
  return to_jsonb(v_row)-'owner';
end; $$;

grant execute on function public.submit_food_item_v3(text,text,text,text,text,text,numeric,smallint,text,text,text,text[],text,text,text,text,double precision,double precision,text) to authenticated;
notify pgrst, 'reload schema';
