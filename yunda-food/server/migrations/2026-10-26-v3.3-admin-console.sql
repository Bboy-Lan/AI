-- 云大饭搭子 v3.3：管理员内容管理台
-- 在已执行 v3/v3.2 的同一 Supabase 项目 SQL Editor 执行；仅新增 RPC，不删除数据。
-- 权限边界：每次调用都由 public.is_admin() 读取 admin_users + auth.uid()，前端不能伪造。

create or replace function public.admin_list_items(p_include_hidden boolean default false)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare v_rows jsonb;
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(f) - 'owner' order by f.submitted_at desc), '[]'::jsonb)
    into v_rows
  from public.food_items f
  where case when p_include_hidden then f.status = 'hidden' else f.status = 'published' end;
  return v_rows;
end; $$;

revoke all on function public.admin_list_items(boolean) from public;
grant execute on function public.admin_list_items(boolean) to authenticated;
notify pgrst, 'reload schema';
