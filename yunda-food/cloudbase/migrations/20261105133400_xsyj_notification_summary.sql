CREATE FUNCTION public.xsyj_notification_summary() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor text:=auth.uid(); unread_count bigint; pending_count bigint:=0;
BEGIN
 IF actor IS NULL OR auth.role()<>'authenticated' OR coalesce((auth.jwt()->>'is_anonymous')::boolean,false) THEN RAISE EXCEPTION '请先登录网页账号。' USING ERRCODE='28000';END IF;
 SELECT count(*) INTO unread_count FROM public.xsyj_messages WHERE owner_uid=actor AND NOT read AND NOT archived;
 IF public.xsyj_is_admin() THEN
  SELECT (SELECT count(*) FROM public.xsyj_reports WHERE status='pending')+(SELECT count(*) FROM public.xsyj_cautions WHERE status='pending')+(SELECT count(*) FROM public.xsyj_feedback WHERE NOT admin_read AND NOT admin_archived) INTO pending_count;
 END IF;
 RETURN jsonb_build_object('unreadCount',unread_count,'pendingCount',pending_count);
END $$;
REVOKE ALL ON FUNCTION public.xsyj_notification_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.xsyj_notification_summary() TO authenticated;
NOTIFY pgrst,'reload schema';
