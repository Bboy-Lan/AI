-- One private bucket. Existing storage policies and buckets are preserved.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('xsyj-media','xsyj-media',false,5242880,ARRAY['image/jpeg','image/png','image/webp']);
CREATE FUNCTION public.xsyj_can_read_media(object_key text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT object_key LIKE auth.uid()||'/%' OR public.xsyj_is_admin()
 OR EXISTS(SELECT 1 FROM public.xsyj_profiles WHERE avatar_key=object_key)
 OR EXISTS(SELECT 1 FROM public.xsyj_foods WHERE status='public' AND body->'images' ? object_key)
 OR EXISTS(SELECT 1 FROM public.xsyj_cautions WHERE status='public' AND body->'images' ? object_key)
$$;
REVOKE ALL ON FUNCTION public.xsyj_can_read_media(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.xsyj_can_read_media(text) TO anon,authenticated;
CREATE POLICY xsyj_media_read ON storage.objects FOR SELECT TO anon,authenticated USING(bucket_id='xsyj-media' AND public.xsyj_can_read_media(name));
CREATE POLICY xsyj_media_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='xsyj-media' AND owner_id=auth.uid() AND (storage.foldername(name))[1]=auth.uid() AND NOT coalesce((auth.jwt()->>'is_anonymous')::boolean,false));
-- Unique upload keys; do not permit overwrite or deletion of referenced media.
NOTIFY pgrst,'reload schema';
