-- Match native requireAdmin-only operations; publishing still requires a complete author profile.
CREATE OR REPLACE FUNCTION public.xsyj_rpc_core(action text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
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
 ELSIF action='publicProfile' THEN
  SELECT uid INTO owner FROM public.xsyj_profiles WHERE md5('profile:'||uid)=target OR (payload->>'self'='true' AND uid=actor);
  IF owner IS NULL THEN SELECT owner_uid INTO owner FROM public.xsyj_foods WHERE id=target AND (status='public' OR owner_uid=actor OR is_admin);END IF;
  IF owner IS NULL THEN SELECT owner_uid INTO owner FROM public.xsyj_reviews WHERE id=target AND status='public';END IF;
  IF owner IS NULL THEN SELECT owner_uid INTO owner FROM public.xsyj_cautions WHERE id=target AND (status='public' OR owner_uid=actor OR is_admin);END IF;
  IF owner IS NULL THEN RETURN null;END IF;
  SELECT jsonb_build_object('name',display_name,'hometown',hometown,'avatarKey',avatar_key,'id',md5('profile:'||uid),'isAdmin',EXISTS(SELECT 1 FROM public.xsyj_admins a WHERE a.uid=owner AND a.enabled)) INTO result FROM public.xsyj_profiles WHERE uid=owner;
  RETURN jsonb_build_object('profile',result,'foods',(SELECT coalesce(jsonb_agg(public.xsyj_food_json(t) ORDER BY t.created_at DESC),'[]') FROM public.xsyj_foods t WHERE owner_uid=owner AND status='public'));
 ELSIF action='reviews' THEN
  IF NOT EXISTS(SELECT 1 FROM public.xsyj_foods WHERE id=target AND (status='public' OR owner_uid=actor OR is_admin)) THEN RETURN '[]';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'foodId',v.food_id,'author',coalesce(p.display_name,'同学'),'hometown',coalesce(p.hometown,''),'rating',v.rating,'text',v.body,'foodVerified',v.food_verified,'ate',true,'createdAt',v.updated_at,'own',v.owner_uid=actor,'profileId',md5('profile:'||v.owner_uid),'avatarKey',coalesce(p.avatar_key,''),'authorRole',CASE WHEN EXISTS(SELECT 1 FROM public.xsyj_admins WHERE uid=v.owner_uid AND enabled) THEN 'admin' ELSE 'user' END,'status',v.status,'reason',v.reason) ORDER BY v.updated_at DESC),'[]') INTO result FROM public.xsyj_reviews v LEFT JOIN public.xsyj_profiles p ON p.uid=v.owner_uid WHERE v.food_id=target AND (v.status='public' OR is_admin); RETURN result;
 ELSIF action='announcement' THEN SELECT body||jsonb_build_object('version',version) INTO result FROM public.xsyj_announcements WHERE id;RETURN coalesce(result,'null');
 ELSIF action='cautions' THEN
  SELECT coalesce(jsonb_agg(t.body||jsonb_build_object('id',t.id,'status',t.status,'reason',CASE WHEN t.owner_uid=actor OR is_admin THEN t.reason ELSE '' END,'author',coalesce(p.display_name,'同学'),'date',t.body->>'date','createdAt',t.created_at,'canEdit',t.owner_uid=actor,'profileId',md5('profile:'||t.owner_uid),'hometown',coalesce(p.hometown,''),'avatarKey',coalesce(p.avatar_key,''),'updatedAt',t.updated_at,'version',t.version,'sequence',lpad(t.sequence::text,16,'0'),'liked',EXISTS(SELECT 1 FROM public.xsyj_caution_likes WHERE post_id=t.id AND owner_uid=actor),'likes',(SELECT count(*) FROM public.xsyj_caution_likes l WHERE l.post_id=t.id)) ORDER BY t.sequence DESC),'[]') INTO result FROM (SELECT * FROM public.xsyj_cautions WHERE (CASE WHEN coalesce((payload->>'mine')::boolean,false) THEN owner_uid=actor ELSE status='public' END) AND (nullif(payload->>'after','') IS NULL OR sequence<(payload->>'after')::bigint) ORDER BY sequence DESC LIMIT 20)t LEFT JOIN public.xsyj_profiles p ON p.uid=t.owner_uid;RETURN result;
 END IF;

 -- No action accepts a caller-provided UID or administrator flag.
 IF action IN ('feedback','messages','saveFeedback','saveAppeal','replyFeedback','feedbackAction','messageAction') THEN
  IF actor IS NULL OR auth.role()<>'authenticated' OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN RAISE EXCEPTION '请先登录网页账号。' USING ERRCODE='28000';END IF;
 ELSE actor:=public.xsyj_require_user(action NOT IN ('saveProfile','ackAnnouncement') AND action NOT LIKE 'admin%');END IF;
 IF action LIKE 'admin%' AND NOT is_admin THEN RAISE EXCEPTION '无管理员权限。' USING ERRCODE='42501';END IF;
 CASE action
 WHEN 'saveProfile' THEN
  title:=trim(coalesce(payload->>'name',''));IF length(title) NOT BETWEEN 2 AND 20 OR NOT public.xsyj_valid_hometown(coalesce(payload->>'hometown','')) OR coalesce(payload->>'avatarKey','') NOT LIKE actor||'/%' THEN RAISE EXCEPTION '请填写昵称、家乡省市并上传本人的头像。';END IF;
  INSERT INTO public.xsyj_profiles(uid,display_name,hometown,avatar_key,preferences) VALUES(actor,title,payload->>'hometown',payload->>'avatarKey',coalesce(payload->'preferences','{}')) ON CONFLICT(uid) DO UPDATE SET display_name=excluded.display_name,hometown=excluded.hometown,avatar_key=excluded.avatar_key,preferences=excluded.preferences,updated_at=now();
 WHEN 'saveFood' THEN
  title:=trim(coalesce(payload->>'name',''));price:=(payload->>'price')::numeric;
  IF length(title) NOT BETWEEN 1 AND 60 OR length(trim(coalesce(payload->>'placeText',''))) NOT BETWEEN 1 AND 400 OR price IS NULL OR price<=0 OR price>=1000 OR NOT coalesce((payload->>'authorAte')::boolean,false) THEN RAISE EXCEPTION '请填写名称、地点、有效价格并确认亲自吃过。';END IF;
  IF coalesce(jsonb_typeof(payload->'images')<>'array',true) OR jsonb_array_length(payload->'images')>3 THEN RAISE EXCEPTION '照片最多3张。';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(payload->'images') image WHERE image NOT LIKE actor||'/%' AND NOT (is_admin AND EXISTS(SELECT 1 FROM public.xsyj_foods x WHERE x.id=target AND x.body->'images' ? image))) THEN RAISE EXCEPTION '只能使用本人上传的照片。';END IF;
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
  DELETE FROM public.xsyj_messages WHERE kind='interaction' AND target_id=target AND source_uid=actor;
  INSERT INTO public.xsyj_messages(owner_uid,kind,body,target_id,source_uid,source_type) VALUES(f.owner_uid,'interaction','推荐收到一条评价',target,actor,'review');
 WHEN 'saveIssue' THEN
  IF length(reason) NOT BETWEEN 2 AND 300 OR payload->>'type' NOT IN ('price_report','content_report') OR NOT EXISTS(SELECT 1 FROM public.xsyj_foods WHERE id=target AND status='public') THEN RAISE EXCEPTION '请说明问题并选择有效推荐。';END IF;
  INSERT INTO public.xsyj_reports(target_type,target_id,kind,reason) VALUES('food',target,payload->>'type',reason);
 WHEN 'myFoods' THEN SELECT coalesce(jsonb_agg(public.xsyj_food_json(t) ORDER BY t.created_at DESC),'[]') INTO result FROM public.xsyj_foods t WHERE owner_uid=actor;RETURN result;
 WHEN 'myFavorites' THEN SELECT coalesce(jsonb_agg(public.xsyj_food_json(t) ORDER BY v.created_at DESC),'[]') INTO result FROM public.xsyj_foods t JOIN public.xsyj_favorites v ON v.food_id=t.id WHERE v.owner_uid=actor AND t.status='public';RETURN result;
 WHEN 'myReviews' THEN SELECT coalesce(jsonb_agg((to_jsonb(v)-'owner_uid')||jsonb_build_object('item_name',(SELECT body->>'name' FROM public.xsyj_foods WHERE id=v.food_id)) ORDER BY v.updated_at DESC),'[]') INTO result FROM public.xsyj_reviews v WHERE owner_uid=actor;RETURN result;
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
 WHEN 'messages' THEN SELECT coalesce(jsonb_agg((to_jsonb(m)-'owner_uid'-'source_uid')||jsonb_build_object('actorName',(SELECT display_name FROM public.xsyj_profiles WHERE uid=m.source_uid),'actorProfileId',CASE WHEN m.source_uid<>'' THEN md5('profile:'||m.source_uid) ELSE null END,'actorAvatar',(SELECT avatar_key FROM public.xsyj_profiles WHERE uid=m.source_uid),'target_type',CASE WHEN EXISTS(SELECT 1 FROM public.xsyj_cautions WHERE id=m.target_id) THEN 'caution' WHEN m.kind='account' THEN 'account' ELSE 'food' END,'linked_id',coalesce((SELECT food_id FROM public.xsyj_reviews WHERE id=m.target_id),m.target_id)) ORDER BY m.read,m.created_at DESC),'[]') INTO result FROM public.xsyj_messages m WHERE owner_uid=actor AND NOT archived AND public.xsyj_message_visible(m);RETURN result;
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
 WHEN 'adminReviews' THEN SELECT coalesce(jsonb_agg((to_jsonb(t)-'owner_uid')||jsonb_build_object('author',(SELECT display_name FROM public.xsyj_profiles WHERE uid=t.owner_uid),'profileId',md5('profile:'||t.owner_uid),'item_name',(SELECT body->>'name' FROM public.xsyj_foods WHERE id=t.food_id)) ORDER BY t.updated_at DESC),'[]') INTO result FROM public.xsyj_reviews t;RETURN result;
 WHEN 'adminCautions' THEN SELECT coalesce(jsonb_agg(t.body||jsonb_build_object('id',t.id,'status',t.status,'reason',t.reason,'version',t.version,'author',(SELECT display_name FROM public.xsyj_profiles WHERE uid=t.owner_uid),'profileId',md5('profile:'||t.owner_uid)) ORDER BY t.created_at DESC),'[]') INTO result FROM public.xsyj_cautions t;RETURN result;
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
 WHEN 'adminResolveAppeal' THEN
  IF length(reason)<2 OR payload->>'status' NOT IN ('approve','reject') THEN RAISE EXCEPTION '请填写处理原因并选择有效结果。';END IF;
  SELECT owner_uid INTO owner FROM public.xsyj_feedback WHERE id=target AND kind='appeal' FOR UPDATE;
  IF owner IS NULL THEN RAISE EXCEPTION '申诉记录不存在。';END IF;
  IF payload->>'status'='approve' THEN UPDATE public.xsyj_profiles SET account_status='active',moderation_reason='',updated_at=now() WHERE uid=owner;END IF;
  UPDATE public.xsyj_feedback SET replies=replies||jsonb_build_array(jsonb_build_object('body',reason,'admin',true,'decision',payload->>'status','createdAt',now())),admin_read=true,user_read=false,user_archived=false,updated_at=now() WHERE id=target;
  INSERT INTO public.xsyj_messages(owner_uid,kind,body,target_id) VALUES(owner,'appeal',reason,target);
  INSERT INTO public.xsyj_audit(actor_uid,action,target_id,reason) VALUES(actor,action,target,reason);
 WHEN 'adminSaveAnnouncement' THEN
  IF length(coalesce(payload->>'body',''))<2 THEN RAISE EXCEPTION '请填写公告正文。';END IF;
  INSERT INTO public.xsyj_announcements(version,body) VALUES(gen_random_uuid()::text,payload) ON CONFLICT(id) DO UPDATE SET version=excluded.version,body=excluded.body,updated_at=now();
 ELSE RAISE EXCEPTION '不支持的操作：%',action USING ERRCODE='22023';
 END CASE;
 RETURN jsonb_build_object('ok',true);
END $$;
CREATE OR REPLACE FUNCTION public.xsyj_rpc(action text,payload jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
<<api>>
DECLARE actor text:=auth.uid(); admin boolean:=public.xsyj_is_admin(); p public.xsyj_profiles; a public.xsyj_announcements; c public.xsyj_cautions; f public.xsyj_foods; fb public.xsyj_feedback; req public.xsyj_requests; target text:=nullif(coalesce(payload->>'id',payload->>'foodId'),''); op text:=payload->>'operation'; title text; content text; version text; new_id text; wanted boolean; result jsonb; request text:=coalesce(payload->>'clientRequestId',payload->>'requestId'); original jsonb:=payload; idempotent boolean; tags jsonb; n integer;
BEGIN
 IF jsonb_typeof(payload)<>'object' OR pg_column_size(payload)>65536 THEN RAISE EXCEPTION '提交格式无效或内容过长。';END IF;
 SELECT * INTO p FROM public.xsyj_profiles WHERE uid=actor;
 IF p.account_status='banned' AND action NOT IN ('context','feedback','messages','saveFeedback','saveAppeal','replyFeedback','feedbackAction','messageAction','myAppeals') THEN RAISE EXCEPTION '账号使用已暂停：%',p.moderation_reason;END IF;
 IF action='context' THEN
  result:=public.xsyj_rpc_core(action,payload);
  RETURN result||jsonb_build_object('profileId',CASE WHEN result->>'uid' IS NOT NULL THEN md5('profile:'||actor) ELSE null END);
 END IF;
 IF action='announcement' THEN
  SELECT * INTO a FROM public.xsyj_announcements WHERE id;
  RETURN a.body||jsonb_build_object('version',a.version,'updatedAt',a.updated_at,'acknowledged',EXISTS(SELECT 1 FROM public.xsyj_announcement_receipts WHERE owner_uid=actor AND xsyj_announcement_receipts.version=a.version));
 END IF;
 IF action='caution' THEN
  SELECT * INTO c FROM public.xsyj_cautions WHERE id=target AND (status='public' OR owner_uid=actor OR admin);
  IF c.id IS NULL THEN RETURN null;END IF;
  SELECT c.body||jsonb_build_object('id',c.id,'status',c.status,'reason',CASE WHEN c.owner_uid=actor OR admin THEN c.reason ELSE '' END,'version',c.version,'canEdit',c.owner_uid=actor,'author',display_name,'profileId',md5('profile:'||uid),'hometown',hometown,'avatarKey',avatar_key,'images',coalesce(c.body->'images','[]'),'createdAt',c.created_at,'updatedAt',c.updated_at,'likes',(SELECT count(*) FROM public.xsyj_caution_likes WHERE post_id=c.id),'liked',EXISTS(SELECT 1 FROM public.xsyj_caution_likes WHERE post_id=c.id AND owner_uid=actor)) INTO result FROM public.xsyj_profiles WHERE uid=c.owner_uid;
  RETURN result;
 END IF;
 IF action='cautions' AND nullif(payload->>'after','') IS NOT NULL AND payload->>'after' !~ '^[0-9]{16}$' THEN RAISE EXCEPTION '分页标识无效，请刷新列表。';END IF;
 IF action IN ('foods','food','reviews','cautions','publicProfile') THEN RETURN public.xsyj_rpc_core(action,payload);END IF;
 IF actor IS NULL OR auth.role()<>'authenticated' OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN RAISE EXCEPTION '请先登录网页账号。' USING ERRCODE='28000';END IF;
 IF action LIKE 'admin%' AND NOT admin THEN RAISE EXCEPTION '无管理员权限。' USING ERRCODE='42501';END IF;
 IF (p.publishing_restricted OR p.account_status='restricted') AND (action IN ('saveReview','saveIssue','saveCaution','likeCaution','reportCaution') OR action='saveFood' AND target IS NULL) THEN RAISE EXCEPTION '已限制发布：%。历史投稿仍可补充。',p.publishing_reason;END IF;
 idempotent:=action IN ('updateFoodLocation','saveFood','saveCaution','saveFeedback','saveAppeal','replyFeedback','reportCaution','saveIssue');
 IF idempotent AND request IS NOT NULL THEN
  IF request !~ '^[a-zA-Z0-9_-]{8,100}$' THEN RAISE EXCEPTION '提交编号无效。';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor||action||request,0));
  SELECT * INTO req FROM public.xsyj_requests WHERE owner_uid=actor AND xsyj_requests.action=xsyj_rpc.action AND request_id=request;
  IF req.owner_uid IS NOT NULL THEN
   IF req.input IS DISTINCT FROM original THEN RAISE EXCEPTION '提交编号与内容不匹配，请重新确认。';END IF;RETURN req.result;
  END IF;
 END IF;
 IF action='updateFoodLocation' THEN
  PERFORM public.xsyj_require_user(true);
  IF request IS NULL OR request !~ '^[a-zA-Z0-9_-]{12,80}$' THEN RAISE EXCEPTION '缺少定位保存编号。';END IF;
  SELECT * INTO f FROM public.xsyj_foods WHERE id=target AND owner_uid=actor FOR UPDATE;
  IF f.id IS NULL THEN RAISE EXCEPTION '只能修改自己投稿的地图位置。';END IF;
  IF jsonb_typeof(payload->'expected') IS DISTINCT FROM 'object' OR NOT ((payload->'expected') ?& ARRAY['latitude','longitude','mapName','locationAddress']) THEN RAISE EXCEPTION '原定位状态不完整，请重新读取。';END IF;
  IF jsonb_build_array(f.body->'latitude',f.body->'longitude',coalesce(f.body->>'mapName',''),coalesce(f.body->>'locationAddress','')) IS DISTINCT FROM jsonb_build_array(payload#>'{expected,latitude}',payload#>'{expected,longitude}',coalesce(payload#>>'{expected,mapName}',''),coalesce(payload#>>'{expected,locationAddress}','')) THEN RAISE EXCEPTION '地图位置已被修改，请重新读取后再选点。';END IF;
  IF nullif(payload->>'latitude','') IS NULL OR nullif(payload->>'longitude','') IS NULL OR (payload->>'latitude')::numeric NOT BETWEEN 24.35 AND 26.45 OR (payload->>'longitude')::numeric NOT BETWEEN 102.1 AND 103.75 OR length(trim(coalesce(payload->>'mapName',''))) NOT BETWEEN 1 AND 80 OR length(coalesce(payload->>'locationAddress',''))>120 THEN RAISE EXCEPTION '请选择昆明范围内的完整地图位置。';END IF;
  UPDATE public.xsyj_foods SET body=body||jsonb_build_object('latitude',(payload->>'latitude')::numeric,'longitude',(payload->>'longitude')::numeric,'mapName',trim(payload->>'mapName'),'locationAddress',coalesce(payload->>'locationAddress',''),'contentUpdatedAt',now()),updated_at=now() WHERE id=target;
  INSERT INTO public.xsyj_audit(actor_uid,action,target_id,reason) VALUES(actor,action,target,'投稿人更新地图位置');
  SELECT public.xsyj_food_json(t) INTO result FROM public.xsyj_foods t WHERE id=target;
  INSERT INTO public.xsyj_requests(owner_uid,action,request_id,input,result) VALUES(actor,action,request,original,result);
  RETURN result;
 ELSIF action='adminProfileDetail' THEN
  SELECT * INTO p FROM public.xsyj_profiles WHERE uid=target OR md5('profile:'||uid)=target;
  IF p.uid IS NULL THEN SELECT p1.* INTO p FROM public.xsyj_profiles p1 JOIN public.xsyj_foods f1 ON f1.owner_uid=p1.uid WHERE f1.id=target;END IF;
  IF p.uid IS NULL THEN SELECT p1.* INTO p FROM public.xsyj_profiles p1 JOIN public.xsyj_reviews r1 ON r1.owner_uid=p1.uid WHERE r1.id=target;END IF;
  IF p.uid IS NULL THEN RAISE EXCEPTION '用户资料不存在。';END IF;
  RETURN jsonb_build_object('profile',to_jsonb(p)||jsonb_build_object('isAdmin',EXISTS(SELECT 1 FROM public.xsyj_admins WHERE uid=p.uid AND enabled)),'foods',(SELECT coalesce(jsonb_agg(public.xsyj_food_json(t) ORDER BY t.created_at DESC),'[]') FROM public.xsyj_foods t WHERE owner_uid=p.uid));
 ELSIF action='adminSaveAnnouncement' THEN
  title:=trim(coalesce(payload->>'title',''));
  SELECT string_agg(trim(line),E'\n') INTO content FROM regexp_split_to_table(replace(coalesce(payload->>'body',''),E'\r\n',E'\n'),E'\n') line WHERE trim(line)<>'';
  IF length(title) NOT BETWEEN 1 AND 20 OR coalesce(length(content),0) NOT BETWEEN 10 AND 260 OR cardinality(string_to_array(content,E'\n'))>6 THEN RAISE EXCEPTION '标题限20字，正文10～260字、最多6段。';END IF;
  IF request IS NULL OR request !~ '^[a-zA-Z0-9_-]{12,80}$' THEN RAISE EXCEPTION '公告保存编号无效，请重试。';END IF;
  SELECT * INTO a FROM public.xsyj_announcements WHERE id FOR UPDATE;
  version:='ann_'||md5(jsonb_build_array(actor,request,payload->>'baseVersion',title,content)::text);
  IF a.version=version THEN RETURN jsonb_build_object('ok',true,'changed',false);END IF;
  IF payload->>'baseVersion' IS DISTINCT FROM a.version THEN RAISE EXCEPTION '公告已有新版本。请取消编辑、查看新版后再修改，当前文字尚未保存。';END IF;
  IF a.body->>'title'=title AND a.body->>'body'=content THEN RETURN jsonb_build_object('ok',true,'changed',false);END IF;
  UPDATE public.xsyj_announcements SET version=api.version,body=jsonb_build_object('title',title,'body',content),updated_at=now() WHERE id;
  INSERT INTO public.xsyj_audit(actor_uid,action,target_id,reason) VALUES(actor,'adminSaveAnnouncement',version,'更新公告');
  RETURN jsonb_build_object('ok',true,'changed',true);
 ELSIF action='saveFood' THEN
  PERFORM public.xsyj_require_user(true);
  IF target IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.xsyj_foods WHERE id=target AND owner_uid=actor) THEN RAISE EXCEPTION '只能编辑自己的推荐。';END IF;
  IF jsonb_typeof(payload->'taste') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION '请填写明确的类别和口味。';END IF;
  IF true THEN
   IF payload->>'category' NOT IN ('正餐','小吃','饮品','甜品') OR trim(coalesce(payload->>'venue',''))='' THEN RAISE EXCEPTION '请选择类别并填写具体地点。';END IF;
   IF length(coalesce(payload->>'school',''))>60 OR length(coalesce(payload->>'campus',''))>60 OR length(coalesce(payload->>'region',''))>80 OR length(payload->>'venue')>80 OR length(coalesce(payload->>'addressSummary',''))>120 OR length(coalesce(payload->>'description',''))>500 THEN RAISE EXCEPTION '地点或说明长度超过限制。';END IF;
   PERFORM public.xsyj_assert_safe_text(concat_ws(' ',payload->>'school',payload->>'campus',payload->>'region',payload->>'venue',payload->>'addressSummary'),'地点');
   IF payload->>'category' IN ('饮品','甜品') THEN
    IF payload#>>'{taste,sweet}' IS NULL OR payload#>>'{taste,sweet}' !~ '^[0-3]$' OR payload#>>'{taste,spicy}' IS NOT NULL OR coalesce(payload#>>'{taste,staple}','')<>'' OR jsonb_array_length(coalesce(payload#>'{taste,tags}','[]'))>0 OR coalesce(payload#>>'{taste,temperature}','') NOT IN ('','冷','热','常温') THEN RAISE EXCEPTION '饮品或甜品请填写有效甜度与冷热。';END IF;
   ELSE
    tags:=coalesce(payload#>'{taste,tags}','[]');
    IF payload#>>'{taste,spicy}' IS NULL OR payload#>>'{taste,spicy}' !~ '^[0-3]$' OR payload#>>'{taste,sweet}' IS NOT NULL OR coalesce(payload#>>'{taste,temperature}','')<>'' OR jsonb_typeof(tags)<>'array' OR jsonb_array_length(tags)>2 OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(tags))<>jsonb_array_length(tags) OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(tags) tag WHERE tag NOT IN ('正常','清淡','偏咸','偏甜','香辣','酸香','麻香')) OR (tags ? '正常' AND jsonb_array_length(tags)>1) OR coalesce(payload#>>'{taste,staple}','') NOT IN ('','米饭','面食','米线','非主食') THEN RAISE EXCEPTION '请填写有效辣度、最多两项口味与主食。';END IF;
   END IF;
  END IF;
  payload:=payload||jsonb_build_object('contentUpdatedAt',now());
 ELSIF action IN ('saveCaution','withdrawCaution','adminCautionStatus') THEN
  PERFORM public.xsyj_require_user(action<>'adminCautionStatus');
  IF target IS NOT NULL THEN
   SELECT * INTO c FROM public.xsyj_cautions WHERE id=target FOR UPDATE;
   IF c.id IS NULL OR (action<>'adminCautionStatus' AND c.owner_uid<>actor) THEN RAISE EXCEPTION '只能编辑自己的经历。';END IF;
   IF payload->>'version' IS NULL OR (payload->>'version')::integer<>c.version THEN RAISE EXCEPTION '经历版本已变化，请重新读取后操作。';END IF;
  END IF;
  IF action='saveCaution' AND NOT coalesce((payload->>'confirmed')::boolean,false) THEN RAISE EXCEPTION '请确认本人亲自消费并如实描述。';END IF;
  IF action='adminCautionStatus' AND NOT ((c.status='pending' AND payload->>'status' IN ('public','returned')) OR (c.status='public' AND payload->>'status'='hidden') OR (c.status='hidden' AND payload->>'status'='public')) THEN RAISE EXCEPTION '当前状态不支持此操作。';END IF;
 ELSIF action='likeCaution' THEN
  PERFORM public.xsyj_require_user(true);
  SELECT * INTO c FROM public.xsyj_cautions WHERE id=target AND status='public' FOR UPDATE;
  IF c.id IS NULL OR jsonb_typeof(payload->'liked') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION '经历暂不可访问或点赞状态无效。';END IF;
  wanted:=(payload->>'liked')::boolean;
  IF wanted THEN
   INSERT INTO public.xsyj_caution_likes(post_id) VALUES(target) ON CONFLICT DO NOTHING;GET DIAGNOSTICS n=ROW_COUNT;
   IF n>0 AND c.owner_uid<>actor THEN INSERT INTO public.xsyj_messages(owner_uid,kind,body,target_id,source_uid,source_type) VALUES(c.owner_uid,'caution','有同学赞了你的消费经历',target,actor,'caution');END IF;
  ELSE DELETE FROM public.xsyj_caution_likes WHERE post_id=target AND owner_uid=actor;END IF;
  RETURN jsonb_build_object('ok',true,'liked',wanted);
 ELSIF action='favorite' THEN
  PERFORM public.xsyj_require_user(true);
  PERFORM pg_advisory_xact_lock(hashtextextended(actor||target,0));
  SELECT * INTO f FROM public.xsyj_foods WHERE id=target AND status='public';
  IF f.id IS NULL THEN RAISE EXCEPTION '推荐不可收藏。';END IF;
  wanted:=coalesce((payload->>'favorite')::boolean,NOT EXISTS(SELECT 1 FROM public.xsyj_favorites WHERE owner_uid=actor AND food_id=target));
  IF wanted THEN
   INSERT INTO public.xsyj_favorites(food_id) VALUES(target) ON CONFLICT DO NOTHING;GET DIAGNOSTICS n=ROW_COUNT;
   IF n>0 AND f.owner_uid<>actor THEN INSERT INTO public.xsyj_messages(owner_uid,kind,body,target_id,source_uid,source_type) VALUES(f.owner_uid,'favorite','有同学收藏了你的推荐',target,actor,'food');END IF;
  ELSE DELETE FROM public.xsyj_favorites WHERE owner_uid=actor AND food_id=target;DELETE FROM public.xsyj_messages WHERE owner_uid=f.owner_uid AND source_uid=actor AND target_id=target AND kind='favorite';END IF;
  RETURN public.xsyj_food_json(f);
 ELSIF action IN ('feedback','myAppeals','adminFeedback','adminAppeals') THEN
  IF action LIKE 'admin%' THEN
   SELECT coalesce(jsonb_agg((to_jsonb(t)-'owner_uid')||jsonb_build_object('profileId',md5('profile:'||t.owner_uid),'author',(SELECT display_name FROM public.xsyj_profiles WHERE uid=t.owner_uid)) ORDER BY CASE WHEN t.kind='appeal' THEN t.appeal_status='pending' ELSE NOT t.admin_read END DESC,t.updated_at DESC),'[]') INTO result FROM public.xsyj_feedback t WHERE NOT t.admin_archived AND (CASE WHEN action='adminAppeals' THEN t.kind='appeal' ELSE t.kind<>'appeal' END);
  ELSE
   SELECT coalesce(jsonb_agg(to_jsonb(t)-'owner_uid' ORDER BY NOT t.user_read DESC,t.updated_at DESC),'[]') INTO result FROM public.xsyj_feedback t WHERE owner_uid=actor AND NOT user_archived AND (CASE WHEN action='myAppeals' THEN kind='appeal' ELSE kind<>'appeal' END);
  END IF;RETURN result;
 ELSIF action IN ('saveFeedback','saveAppeal','replyFeedback') THEN
  content:=trim(coalesce(payload->>'body',''));
  IF length(content) NOT BETWEEN 2 AND 500 THEN RAISE EXCEPTION '请填写2～500字说明。';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(actor||action,0));
  IF action='replyFeedback' THEN
   SELECT * INTO fb FROM public.xsyj_feedback WHERE id=target AND (owner_uid=actor OR admin) FOR UPDATE;
   IF fb.id IS NULL OR fb.kind='appeal' THEN RAISE EXCEPTION '无权回复此反馈。';END IF;
   IF jsonb_array_length(fb.replies)>=20 THEN RAISE EXCEPTION '本条交流已满20条回复，请另提交反馈。';END IF;
  ELSE
   IF p.uid IS NULL THEN RAISE EXCEPTION '请先完善头像、昵称和家乡省市资料。';END IF;
   IF (SELECT count(*) FROM public.xsyj_feedback WHERE owner_uid=actor AND (kind='appeal')=(action='saveAppeal') AND (created_at AT TIME ZONE 'Asia/Shanghai')::date=(now() AT TIME ZONE 'Asia/Shanghai')::date)>=5 THEN RAISE EXCEPTION '每天最多提交5条，请等待管理员处理。';END IF;
   IF action='saveFeedback' AND (admin OR payload->>'type' NOT IN ('使用问题','功能建议','地点纠错','其他')) THEN RAISE EXCEPTION '请选择反馈类型；管理员请查看和回复用户反馈。';END IF;
   IF action='saveAppeal' THEN
    IF p.account_status='active' AND NOT p.publishing_restricted THEN RAISE EXCEPTION '该项限制已解除，请重新读取账号状态。';END IF;
    SELECT * INTO fb FROM public.xsyj_feedback WHERE owner_uid=actor AND kind='appeal' AND appeal_status='pending' AND restriction_revision=CASE WHEN p.account_status='banned' THEN p.ban_revision ELSE p.restriction_revision END;
    IF fb.id IS NOT NULL THEN RETURN jsonb_build_object('id',fb.id,'alreadyPending',true);END IF;
   END IF;
  END IF;
 ELSIF action IN ('feedbackAction','adminFeedbackAction') THEN
  IF op NOT IN ('read','delete','clear') OR op IS NULL THEN RAISE EXCEPTION '无效操作。';END IF;
  IF action='adminFeedbackAction' THEN
   UPDATE public.xsyj_feedback SET admin_read=true,admin_archived=CASE WHEN op='read' THEN admin_archived ELSE true END WHERE (id=target OR op='clear' AND admin_read) AND kind<>'appeal';
  ELSE
   UPDATE public.xsyj_feedback SET user_read=true,user_archived=CASE WHEN op='read' THEN user_archived ELSE true END WHERE owner_uid=actor AND (id=target OR op='clear' AND user_read AND admin_read) AND kind<>'appeal';
  END IF;RETURN jsonb_build_object('ok',true);
 ELSIF action='adminReportAction' THEN
  IF op='read' THEN UPDATE public.xsyj_reports SET read=true WHERE id=target;
  ELSIF op IN ('clear','delete') THEN UPDATE public.xsyj_reports SET archived=true WHERE status='resolved' AND (op='delete' AND id=target OR op='clear' AND read);ELSE RAISE EXCEPTION '无效操作。';END IF;
  RETURN jsonb_build_object('ok',true);
 ELSIF action='adminReports' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(t)-'owner_uid' ORDER BY t.status='pending' DESC,t.created_at DESC),'[]') INTO result FROM public.xsyj_reports t WHERE NOT archived;RETURN result;
 ELSIF action='adminAccountStatus' THEN
  IF length(trim(coalesce(payload->>'reason',''))) NOT BETWEEN 2 AND 120 OR payload->>'status' NOT IN ('active','restricted','banned','unrestrict') THEN RAISE EXCEPTION '请选择有效操作并填写2～120字处理原因。';END IF;
  IF EXISTS(SELECT 1 FROM public.xsyj_admins WHERE uid=target AND enabled) THEN RAISE EXCEPTION '不能在此限制管理员。';END IF;
  SELECT * INTO p FROM public.xsyj_profiles WHERE uid=target FOR UPDATE;
  IF p.uid IS NULL THEN RAISE EXCEPTION '目标不存在。';END IF;
  IF payload->>'status'='restricted' THEN UPDATE public.xsyj_profiles SET publishing_restricted=true,publishing_reason=payload->>'reason',restriction_revision=gen_random_uuid()::text,account_status=CASE WHEN account_status='banned' THEN 'banned' ELSE 'restricted' END,moderation_reason=CASE WHEN account_status='banned' THEN moderation_reason ELSE payload->>'reason' END,updated_at=now() WHERE uid=target;
  ELSIF payload->>'status'='unrestrict' THEN UPDATE public.xsyj_profiles SET publishing_restricted=false,publishing_reason='',restriction_revision=gen_random_uuid()::text,account_status=CASE WHEN account_status='banned' THEN 'banned' ELSE 'active' END,updated_at=now() WHERE uid=target;
  ELSE UPDATE public.xsyj_profiles SET account_status=CASE WHEN payload->>'status'='active' AND publishing_restricted THEN 'restricted' ELSE payload->>'status' END,moderation_reason=CASE WHEN payload->>'status'='active' THEN publishing_reason ELSE payload->>'reason' END,ban_revision=gen_random_uuid()::text,updated_at=now() WHERE uid=target;END IF;
  INSERT INTO public.xsyj_audit(actor_uid,action,target_id,reason) VALUES(actor,action,target,payload->>'reason');
  INSERT INTO public.xsyj_messages(owner_uid,kind,body,target_id) VALUES(target,'account',payload->>'reason',target);
  RETURN jsonb_build_object('ok',true);
 ELSIF action='adminResolveAppeal' THEN
  SELECT * INTO fb FROM public.xsyj_feedback WHERE id=target AND kind='appeal' FOR UPDATE;
  IF fb.id IS NULL OR payload->>'status' NOT IN ('approve','reject') OR length(trim(coalesce(payload->>'reason',''))) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION '申请不存在或处理说明无效。';END IF;
  IF fb.appeal_status<>'pending' THEN RAISE EXCEPTION '申请已处理，请重新读取。';END IF;
  SELECT * INTO p FROM public.xsyj_profiles WHERE uid=fb.owner_uid FOR UPDATE;
  IF actor=fb.owner_uid OR EXISTS(SELECT 1 FROM public.xsyj_admins WHERE uid=fb.owner_uid AND enabled) THEN RAISE EXCEPTION '不能处理管理员自身的限制。';END IF;
  IF payload->>'status'='approve' THEN
   IF fb.restriction_revision IS DISTINCT FROM (CASE WHEN fb.appeal_target='account' THEN p.ban_revision ELSE p.restriction_revision END) THEN RAISE EXCEPTION '限制已有变化，不能用旧申请解除新限制。';END IF;
   IF fb.appeal_target='account' THEN UPDATE public.xsyj_profiles SET account_status=CASE WHEN publishing_restricted THEN 'restricted' ELSE 'active' END,moderation_reason=publishing_reason,ban_revision=gen_random_uuid()::text,updated_at=now() WHERE uid=p.uid;
   ELSE UPDATE public.xsyj_profiles SET publishing_restricted=false,publishing_reason='',account_status=CASE WHEN account_status='banned' THEN 'banned' ELSE 'active' END,restriction_revision=gen_random_uuid()::text,updated_at=now() WHERE uid=p.uid;END IF;
  END IF;
  UPDATE public.xsyj_feedback SET appeal_status=payload->>'status',admin_read=true,user_read=false,replies=replies||jsonb_build_array(jsonb_build_object('body',payload->>'reason','admin',true,'decision',payload->>'status','createdAt',now())),updated_at=now() WHERE id=target;
  INSERT INTO public.xsyj_audit(actor_uid,action,target_id,reason) VALUES(actor,action,target,payload->>'reason');
  RETURN jsonb_build_object('ok',true);
 END IF;
 result:=public.xsyj_rpc_core(action,payload);
 IF action='saveAppeal' THEN UPDATE public.xsyj_feedback SET appeal_status='pending',appeal_target=CASE WHEN p.account_status='banned' THEN 'account' ELSE 'publishing' END,restriction_revision=CASE WHEN p.account_status='banned' THEN p.ban_revision ELSE p.restriction_revision END WHERE id=result->>'id';END IF;
 IF action='saveCaution' THEN new_id:=result->>'id';ELSE new_id:=target;END IF;
 IF action IN ('saveCaution','withdrawCaution','adminCautionStatus') AND target IS NOT NULL THEN UPDATE public.xsyj_cautions SET version=xsyj_cautions.version+1 WHERE id=new_id;END IF;
 IF action='adminCautionStatus' THEN UPDATE public.xsyj_messages SET kind='caution',source_type='caution' WHERE target_id=target AND kind='moderation';END IF;
 IF action IN ('saveIssue','reportCaution') THEN
  UPDATE public.xsyj_reports SET snapshot=CASE WHEN target_type='food' THEN (SELECT body FROM public.xsyj_foods WHERE id=target_id) ELSE (SELECT sc.body||jsonb_build_object('version',sc.version) FROM public.xsyj_cautions sc WHERE sc.id=target_id) END WHERE owner_uid=actor AND target_id=target AND created_at=now();
 END IF;
 IF idempotent AND request IS NOT NULL THEN INSERT INTO public.xsyj_requests(owner_uid,action,request_id,input,result) VALUES(actor,action,request,original,result);END IF;
 RETURN result;
END $$;
NOTIFY pgrst,'reload schema';
