-- Link messages to their actual food/caution and expose public actor metadata only.
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
 ELSE actor:=public.xsyj_require_user(action NOT IN ('saveProfile','ackAnnouncement'));END IF;
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
NOTIFY pgrst,'reload schema';
