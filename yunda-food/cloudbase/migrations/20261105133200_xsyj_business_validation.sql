-- Preserve mini-program text validation and canonical hometown rules.
CREATE FUNCTION public.xsyj_valid_hometown(value text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
 SELECT value ~ '^(北京市|天津市|上海市|重庆市)$' OR value ~ '^(河北省|山西省|内蒙古自治区|辽宁省|吉林省|黑龙江省|江苏省|浙江省|安徽省|福建省|江西省|山东省|河南省|湖北省|湖南省|广东省|广西壮族自治区|海南省|四川省|贵州省|云南省|西藏自治区|陕西省|甘肃省|青海省|宁夏回族自治区|新疆维吾尔自治区|台湾省).+(市|地区|盟|自治州|省直辖县级行政区划|自治区直辖县级行政区划)$' OR value ~ '^香港特别行政区(香港岛|九龙|新界)$' OR value ~ '^澳门特别行政区(澳门半岛|氹仔岛|路环岛)$'
$$;
CREATE FUNCTION public.xsyj_assert_safe_text(value text,label text) RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE term text; normalized text:=regexp_replace(lower(coalesce(value,'')),'[[:space:][:punct:]]','','g');
BEGIN
 FOREACH term IN ARRAY ARRAY['加微','加群','推广','广告','代理','兼职','刷单','博彩','赌博','色情','裸聊','毒品','贷款','代购彩票'] LOOP
  IF position(term IN normalized)>0 THEN RAISE EXCEPTION '%包含不适合发布或疑似推广的内容。',label;END IF;
 END LOOP;
 IF value ~* 'https?://|www\.|1[3-9][0-9]{9}|(vx|wx)[[:space:]]*[:：][[:space:]]*[a-z0-9_-]{4,}' OR value ~ '(.)\1{8,}' THEN RAISE EXCEPTION '%不能包含链接、联系方式、引流或大量重复字符。',label;END IF;
END $$;
CREATE FUNCTION public.xsyj_validate_content() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 IF TG_TABLE_NAME='xsyj_profiles' THEN
  IF NOT public.xsyj_valid_hometown(NEW.hometown) THEN RAISE EXCEPTION '请选择规范的家乡省市。';END IF;
  PERFORM public.xsyj_assert_safe_text(NEW.display_name,'昵称');
 ELSIF TG_TABLE_NAME='xsyj_foods' THEN
  PERFORM public.xsyj_assert_safe_text(NEW.body->>'name','菜品名称');
  PERFORM public.xsyj_assert_safe_text(NEW.body->>'placeText','地点');
  PERFORM public.xsyj_assert_safe_text(NEW.body->>'description','补充说明');
 ELSIF TG_TABLE_NAME='xsyj_cautions' THEN
  PERFORM public.xsyj_assert_safe_text(NEW.body->>'name','店铺名称');
  PERFORM public.xsyj_assert_safe_text(NEW.body->>'body','消费经历');
 ELSIF TG_TABLE_NAME IN ('xsyj_reviews','xsyj_feedback') THEN PERFORM public.xsyj_assert_safe_text(NEW.body,'内容');
 ELSIF TG_TABLE_NAME='xsyj_reports' THEN PERFORM public.xsyj_assert_safe_text(NEW.reason,'反馈内容');
 END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE name text; BEGIN FOREACH name IN ARRAY ARRAY['profiles','foods','cautions','reviews','feedback','reports'] LOOP
 EXECUTE format('CREATE TRIGGER xsyj_validate BEFORE INSERT OR UPDATE ON public.xsyj_%I FOR EACH ROW EXECUTE FUNCTION public.xsyj_validate_content()',name);
 END LOOP;END $$;
CREATE OR REPLACE FUNCTION public.xsyj_require_user(require_profile boolean DEFAULT true) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor text:=auth.uid(); p public.xsyj_profiles;
BEGIN
 IF actor IS NULL OR auth.role()<>'authenticated' OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN RAISE EXCEPTION '请先登录网页账号。' USING ERRCODE='28000'; END IF;
 SELECT * INTO p FROM public.xsyj_profiles WHERE uid=actor;
 IF require_profile AND (p.uid IS NULL OR p.avatar_key='' OR NOT public.xsyj_valid_hometown(p.hometown)) THEN RAISE EXCEPTION '请先完善头像、昵称和家乡省市资料。'; END IF;
 IF p.account_status IN ('restricted','banned') THEN RAISE EXCEPTION '账号受限：%',p.moderation_reason; END IF;
 RETURN actor;
END $$;
CREATE OR REPLACE FUNCTION public.xsyj_rpc(action text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
<<api>>
DECLARE actor text:=auth.uid(); is_admin boolean:=public.xsyj_is_admin(); result jsonb; f public.xsyj_foods; c public.xsyj_cautions; r public.xsyj_reviews; profile_row public.xsyj_profiles; target text:=coalesce(payload->>'id',payload->>'foodId',payload->>'itemId',payload->>'postId'); reason text:=trim(coalesce(payload->>'reason','')); new_id text; new_status text; title text; price numeric; v_rating integer; owner text; row_count integer;
BEGIN
 IF pg_column_size(payload)>65536 THEN RAISE EXCEPTION '提交内容过长。';END IF;
 IF action='context' THEN
  SELECT * INTO profile_row FROM public.xsyj_profiles WHERE uid=actor;
  RETURN jsonb_build_object('uid',CASE WHEN auth.role()='authenticated' AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN actor ELSE null END,'isAdmin',is_admin,'profile',CASE WHEN profile_row.uid IS NULL THEN null ELSE to_jsonb(profile_row)-'uid' END,'backend','cloudbase-postgresql');
 ELSIF action='foods' THEN
  SELECT coalesce(jsonb_agg(public.xsyj_food_json(t) ORDER BY t.created_at DESC),'[]') INTO result FROM (SELECT * FROM public.xsyj_foods WHERE status='public' ORDER BY created_at DESC LIMIT 100) t;RETURN result;
 ELSIF action='food' THEN
  SELECT * INTO f FROM public.xsyj_foods WHERE id=target AND (status='public' OR owner_uid=actor OR is_admin);IF f.id IS NULL THEN RETURN null;END IF;RETURN public.xsyj_food_json(f);
 ELSIF action='reviews' THEN
  IF NOT EXISTS(SELECT 1 FROM public.xsyj_foods WHERE id=target AND (status='public' OR owner_uid=actor OR is_admin)) THEN RETURN '[]';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'foodId',v.food_id,'author',coalesce(p.display_name,'同学'),'hometown',coalesce(p.hometown,''),'rating',v.rating,'text',v.body,'foodVerified',v.food_verified,'ate',true,'createdAt',v.updated_at,'own',v.owner_uid=actor) ORDER BY v.updated_at DESC),'[]') INTO result FROM public.xsyj_reviews v LEFT JOIN public.xsyj_profiles p ON p.uid=v.owner_uid WHERE v.food_id=target AND v.status='public'; RETURN result;
 ELSIF action='announcement' THEN SELECT body||jsonb_build_object('version',version) INTO result FROM public.xsyj_announcements WHERE id;RETURN coalesce(result,'null');
 ELSIF action='cautions' THEN
  SELECT coalesce(jsonb_agg(t.body||jsonb_build_object('id',t.id,'status',t.status,'reason',t.reason,'author',coalesce(p.display_name,'同学'),'date',t.body->>'date','createdAt',t.created_at,'canEdit',t.owner_uid=actor,'likes',(SELECT count(*) FROM public.xsyj_caution_likes l WHERE l.post_id=t.id)) ORDER BY t.created_at DESC),'[]') INTO result FROM (SELECT * FROM public.xsyj_cautions WHERE CASE WHEN coalesce((payload->>'mine')::boolean,false) THEN owner_uid=actor ELSE status='public' END ORDER BY created_at DESC LIMIT 100)t LEFT JOIN public.xsyj_profiles p ON p.uid=t.owner_uid;RETURN result;
 END IF;

 -- No action accepts a caller-provided UID or administrator flag.
 IF action IN ('feedback','messages','saveFeedback','saveAppeal') THEN
  IF actor IS NULL OR auth.role()<>'authenticated' OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN RAISE EXCEPTION '请先登录网页账号。' USING ERRCODE='28000';END IF;
 ELSE actor:=public.xsyj_require_user(action NOT IN ('saveProfile','ackAnnouncement'));END IF;
 IF action LIKE 'admin%' AND NOT is_admin THEN RAISE EXCEPTION '无管理员权限。' USING ERRCODE='42501';END IF;
 CASE action
 WHEN 'saveProfile' THEN
  title:=trim(coalesce(payload->>'name',''));IF length(title) NOT BETWEEN 2 AND 30 OR NOT public.xsyj_valid_hometown(coalesce(payload->>'hometown','')) OR coalesce(payload->>'avatarKey','') NOT LIKE actor||'/%' THEN RAISE EXCEPTION '请填写昵称、家乡省市并上传本人的头像。';END IF;
  INSERT INTO public.xsyj_profiles(uid,display_name,hometown,avatar_key,preferences) VALUES(actor,title,payload->>'hometown',payload->>'avatarKey',coalesce(payload->'preferences','{}')) ON CONFLICT(uid) DO UPDATE SET display_name=excluded.display_name,hometown=excluded.hometown,avatar_key=excluded.avatar_key,preferences=excluded.preferences,updated_at=now();
 WHEN 'saveFood' THEN
  title:=trim(coalesce(payload->>'name',''));price:=(payload->>'price')::numeric;
  IF length(title) NOT BETWEEN 1 AND 60 OR length(trim(coalesce(payload->>'placeText',''))) NOT BETWEEN 1 AND 120 OR price IS NULL OR price<=0 OR price>=1000 OR NOT coalesce((payload->>'authorAte')::boolean,false) THEN RAISE EXCEPTION '请填写名称、地点、有效价格并确认亲自吃过。';END IF;
  IF coalesce(jsonb_typeof(payload->'images')<>'array',true) OR jsonb_array_length(payload->'images')>3 THEN RAISE EXCEPTION '照片最多3张。';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(payload->'images') image WHERE image NOT LIKE actor||'/%') THEN RAISE EXCEPTION '只能使用本人上传的照片。';END IF;
  IF target IS NOT NULL THEN
   SELECT * INTO f FROM public.xsyj_foods WHERE id=target FOR UPDATE;IF f.id IS NULL OR (f.owner_uid<>actor AND NOT is_admin) THEN RAISE EXCEPTION '只能编辑自己的推荐。';END IF;
   UPDATE public.xsyj_foods SET body=(payload-'id'-'author'-'hometown'-'status'-'isAdmin'-'owner_uid'),updated_at=now() WHERE id=target;new_id:=target;
  ELSE
   PERFORM pg_advisory_xact_lock(hashtextextended(actor,0));IF (SELECT count(*) FROM public.xsyj_foods WHERE owner_uid=actor AND (created_at AT TIME ZONE 'Asia/Shanghai')::date=(now() AT TIME ZONE 'Asia/Shanghai')::date)>=3 THEN RAISE EXCEPTION '每位用户每天最多发布3条推荐。';END IF;
   INSERT INTO public.xsyj_foods(body) VALUES(payload-'author'-'hometown'-'status'-'isAdmin'-'owner_uid') RETURNING id INTO new_id;
  END IF;
  SELECT public.xsyj_food_json(t) INTO result FROM public.xsyj_foods t WHERE id=new_id;RETURN result;
 WHEN 'favorite' THEN
  IF NOT EXISTS(SELECT 1 FROM public.xsyj_foods WHERE id=target AND status='public') THEN RAISE EXCEPTION '该推荐不可收藏。';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor||target,0));DELETE FROM public.xsyj_favorites WHERE owner_uid=actor AND food_id=target;GET DIAGNOSTICS row_count=ROW_COUNT;IF row_count=0 THEN INSERT INTO public.xsyj_favorites(food_id) VALUES(target);END IF;
  SELECT public.xsyj_food_json(t) INTO result FROM public.xsyj_foods t WHERE id=target;RETURN result;
 WHEN 'saveReview' THEN
  SELECT * INTO f FROM public.xsyj_foods WHERE id=target AND status='public';IF f.id IS NULL OR f.owner_uid=actor THEN RAISE EXCEPTION '推荐不可评分，或投稿人不能自评。';END IF;
  v_rating:=(payload->>'rating')::integer;IF NOT coalesce((payload->>'ate')::boolean,false) OR v_rating IS NULL OR v_rating NOT BETWEEN 1 AND 5 OR length(coalesce(payload->>'text',''))>300 THEN RAISE EXCEPTION '请确认亲自吃过，选择1～5分，评价不超过300字。';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor,0));
  IF NOT EXISTS(SELECT 1 FROM public.xsyj_reviews WHERE owner_uid=actor AND food_id=target) AND (SELECT count(*) FROM public.xsyj_reviews WHERE owner_uid=actor AND (created_at AT TIME ZONE 'Asia/Shanghai')::date=(now() AT TIME ZONE 'Asia/Shanghai')::date)>=10 THEN RAISE EXCEPTION '每天最多新增10条评价。';END IF;
  INSERT INTO public.xsyj_reviews(food_id,rating,body,food_verified) VALUES(target,v_rating,trim(coalesce(payload->>'text','')),coalesce((payload->>'foodVerified')::boolean,false)) ON CONFLICT(food_id,owner_uid) DO UPDATE SET rating=excluded.rating,body=excluded.body,food_verified=excluded.food_verified,status='public',updated_at=now();
  INSERT INTO public.xsyj_messages(owner_uid,kind,body,target_id) VALUES(f.owner_uid,'interaction','推荐收到一条评价',target);
 WHEN 'saveIssue' THEN
  IF length(reason) NOT BETWEEN 2 AND 300 OR payload->>'type' NOT IN ('price_report','content_report') OR NOT EXISTS(SELECT 1 FROM public.xsyj_foods WHERE id=target AND status='public') THEN RAISE EXCEPTION '请说明问题并选择有效推荐。';END IF;
  INSERT INTO public.xsyj_reports(target_type,target_id,kind,reason) VALUES('food',target,payload->>'type',reason);
 WHEN 'myFoods' THEN SELECT coalesce(jsonb_agg(public.xsyj_food_json(t) ORDER BY t.created_at DESC),'[]') INTO result FROM public.xsyj_foods t WHERE owner_uid=actor;RETURN result;
 WHEN 'myFavorites' THEN SELECT coalesce(jsonb_agg(public.xsyj_food_json(t) ORDER BY v.created_at DESC),'[]') INTO result FROM public.xsyj_foods t JOIN public.xsyj_favorites v ON v.food_id=t.id WHERE v.owner_uid=actor AND t.status='public';RETURN result;
 WHEN 'myReviews' THEN SELECT coalesce(jsonb_agg(to_jsonb(v)-'owner_uid' ORDER BY v.updated_at DESC),'[]') INTO result FROM public.xsyj_reviews v WHERE owner_uid=actor;RETURN result;
 WHEN 'saveCaution' THEN
  IF length(trim(coalesce(payload->>'name',''))) NOT BETWEEN 1 AND 50 OR length(trim(coalesce(payload->>'address',''))) NOT BETWEEN 2 AND 120 OR length(trim(coalesce(payload->>'body',''))) NOT BETWEEN 10 AND 1000 OR (payload->>'date')::date>(now() AT TIME ZONE 'Asia/Shanghai')::date OR payload->>'date' IS NULL THEN RAISE EXCEPTION '请完整填写店铺、地点、有效消费日期及10～1000字经历。';END IF;
  IF jsonb_array_length(coalesce(payload->'images','[]'))>3 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(payload->'images','[]')) image WHERE image NOT LIKE actor||'/%') THEN RAISE EXCEPTION '照片最多3张且必须本人上传。';END IF;
  IF target IS NULL THEN INSERT INTO public.xsyj_cautions(body) VALUES(payload-'author'-'status'-'owner_uid') RETURNING id INTO new_id;
  ELSE UPDATE public.xsyj_cautions SET body=payload-'id'-'author'-'status'-'owner_uid',status='pending',reason='',updated_at=now() WHERE id=target AND owner_uid=actor RETURNING id INTO new_id;IF new_id IS NULL THEN RAISE EXCEPTION '只能编辑自己的经历。';END IF;END IF;RETURN jsonb_build_object('id',new_id,'status','pending');
 WHEN 'withdrawCaution' THEN UPDATE public.xsyj_cautions SET status='withdrawn',updated_at=now() WHERE id=target AND owner_uid=actor;IF NOT FOUND THEN RAISE EXCEPTION '只能撤回自己的经历。';END IF;
 WHEN 'likeCaution' THEN
  IF NOT EXISTS(SELECT 1 FROM public.xsyj_cautions WHERE id=target AND status='public') THEN RAISE EXCEPTION '该经历暂不可访问。';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor||target,0));DELETE FROM public.xsyj_caution_likes WHERE owner_uid=actor AND post_id=target;GET DIAGNOSTICS row_count=ROW_COUNT;IF row_count=0 THEN INSERT INTO public.xsyj_caution_likes(post_id) VALUES(target);END IF;
 WHEN 'reportCaution' THEN IF length(reason) NOT BETWEEN 2 AND 300 THEN RAISE EXCEPTION '请说明举报原因。';END IF;INSERT INTO public.xsyj_reports(target_type,target_id,kind,reason) VALUES('caution',target,'content_report',reason);
 WHEN 'messages' THEN SELECT coalesce(jsonb_agg(to_jsonb(m)-'owner_uid' ORDER BY m.read,m.created_at DESC),'[]') INTO result FROM public.xsyj_messages m WHERE owner_uid=actor AND NOT archived;RETURN result;
 WHEN 'messageAction' THEN
  IF payload->>'operation'='read' THEN UPDATE public.xsyj_messages SET read=true WHERE id=target AND owner_uid=actor;
  ELSIF payload->>'operation'='delete' THEN UPDATE public.xsyj_messages SET archived=true WHERE id=target AND owner_uid=actor;
  ELSIF payload->>'operation'='clear' THEN UPDATE public.xsyj_messages SET archived=true WHERE read AND owner_uid=actor;ELSE RAISE EXCEPTION '无效操作。';END IF;
 WHEN 'feedback' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)-'owner_uid' ORDER BY user_read,updated_at DESC),'[]') INTO result FROM public.xsyj_feedback t WHERE owner_uid=actor AND NOT user_archived;RETURN result;
 WHEN 'saveFeedback','saveAppeal' THEN
  IF length(trim(coalesce(payload->>'body',''))) NOT BETWEEN 2 AND 1000 THEN RAISE EXCEPTION '请填写2～1000字说明。';END IF;
  INSERT INTO public.xsyj_feedback(kind,body) VALUES(CASE WHEN action='saveAppeal' THEN 'appeal' ELSE coalesce(payload->>'type','feedback') END,trim(payload->>'body')) RETURNING id INTO new_id;RETURN jsonb_build_object('id',new_id);
 WHEN 'replyFeedback' THEN
  IF length(trim(coalesce(payload->>'body',''))) NOT BETWEEN 2 AND 1000 THEN RAISE EXCEPTION '回复需2～1000字。';END IF;
  UPDATE public.xsyj_feedback SET replies=replies||jsonb_build_array(jsonb_build_object('body',trim(payload->>'body'),'admin',is_admin,'createdAt',now())),user_read=NOT is_admin,admin_read=is_admin,user_archived=false,admin_archived=false,updated_at=now() WHERE id=target AND (owner_uid=actor OR is_admin);IF NOT FOUND THEN RAISE EXCEPTION '无权回复此反馈。';END IF;
 WHEN 'feedbackAction' THEN
  IF payload->>'operation'='read' THEN UPDATE public.xsyj_feedback SET user_read=true WHERE id=target AND owner_uid=actor;
  ELSIF payload->>'operation'='delete' THEN UPDATE public.xsyj_feedback SET user_archived=true WHERE id=target AND owner_uid=actor;
  ELSIF payload->>'operation'='clear' THEN UPDATE public.xsyj_feedback SET user_archived=true WHERE user_read AND owner_uid=actor;ELSE RAISE EXCEPTION '无效操作。';END IF;
 WHEN 'ackAnnouncement' THEN
  IF NOT EXISTS(SELECT 1 FROM public.xsyj_announcements WHERE id AND version=payload->>'version') THEN RAISE EXCEPTION '公告版本已变化，请重新查看。';END IF;INSERT INTO public.xsyj_announcement_receipts(version) VALUES(payload->>'version') ON CONFLICT DO NOTHING;
 WHEN 'adminFoods' THEN SELECT coalesce(jsonb_agg(public.xsyj_food_json(t) ORDER BY t.created_at DESC),'[]') INTO result FROM public.xsyj_foods t;RETURN result;
 WHEN 'adminReviews' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)-'owner_uid' ORDER BY t.updated_at DESC),'[]') INTO result FROM public.xsyj_reviews t;RETURN result;
 WHEN 'adminCautions' THEN SELECT coalesce(jsonb_agg(t.body||jsonb_build_object('id',t.id,'status',t.status,'reason',t.reason) ORDER BY t.created_at DESC),'[]') INTO result FROM public.xsyj_cautions t;RETURN result;
 WHEN 'adminProfiles' THEN SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC),'[]') INTO result FROM public.xsyj_profiles t;RETURN result;
 WHEN 'adminReports' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)-'owner_uid' ORDER BY t.status DESC,t.created_at DESC),'[]') INTO result FROM public.xsyj_reports t;RETURN result;
 WHEN 'adminFeedback' THEN SELECT coalesce(jsonb_agg(to_jsonb(t)-'owner_uid' ORDER BY admin_read,updated_at DESC),'[]') INTO result FROM public.xsyj_feedback t WHERE NOT admin_archived;RETURN result;
 WHEN 'adminFoodStatus','adminReviewStatus','adminCautionStatus','adminAccountStatus','adminResolveReport' THEN
  IF length(reason)<2 OR length(reason)>300 THEN RAISE EXCEPTION '请填写2～300字处理原因。';END IF;
  new_status:=payload->>'status';
  IF action='adminFoodStatus' THEN UPDATE public.xsyj_foods SET status=new_status,reason=api.reason,updated_at=now() WHERE id=target RETURNING owner_uid INTO owner;
  ELSIF action='adminReviewStatus' THEN UPDATE public.xsyj_reviews SET status=new_status,reason=api.reason,updated_at=now() WHERE id=target RETURNING owner_uid INTO owner;
  ELSIF action='adminCautionStatus' THEN UPDATE public.xsyj_cautions SET status=new_status,reason=api.reason,updated_at=now() WHERE id=target RETURNING owner_uid INTO owner;
  ELSIF action='adminAccountStatus' THEN
   IF EXISTS(SELECT 1 FROM public.xsyj_admins WHERE uid=target AND enabled) THEN RAISE EXCEPTION '不能在此限制管理员。';END IF;
   UPDATE public.xsyj_profiles SET account_status=new_status,moderation_reason=api.reason,updated_at=now() WHERE uid=target RETURNING uid INTO owner;
  ELSE UPDATE public.xsyj_reports SET status='resolved',resolution=api.reason,updated_at=now() WHERE id=target RETURNING owner_uid INTO owner;END IF;
  IF owner IS NULL THEN RAISE EXCEPTION '目标不存在。';END IF;
  INSERT INTO public.xsyj_audit(actor_uid,action,target_id,reason) VALUES(actor,action,target,reason);
  INSERT INTO public.xsyj_messages(owner_uid,kind,body,target_id) VALUES(owner,'moderation',reason,target);
 WHEN 'adminSaveAnnouncement' THEN
  IF length(coalesce(payload->>'body',''))<2 THEN RAISE EXCEPTION '请填写公告正文。';END IF;
  INSERT INTO public.xsyj_announcements(version,body) VALUES(gen_random_uuid()::text,payload) ON CONFLICT(id) DO UPDATE SET version=excluded.version,body=excluded.body,updated_at=now();
 ELSE RAISE EXCEPTION '不支持的操作：%',action USING ERRCODE='22023';
 END CASE;
 RETURN jsonb_build_object('ok',true);
END $$;


REVOKE ALL ON FUNCTION public.xsyj_assert_safe_text(text,text),public.xsyj_validate_content() FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
