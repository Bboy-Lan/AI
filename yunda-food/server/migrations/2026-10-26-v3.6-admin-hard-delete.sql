-- v3.6：管理员物理删除云端投稿。仅删除指定 food_items 行及外键级联的评论/收藏；不影响其他投稿。
-- 图片对象可能因 Storage 与数据库独立而保留为不可见孤立文件，后续可在 Storage 控制台按路径清理。
create or replace function public.admin_delete_item(p_item_id uuid)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  delete from public.food_items where id=p_item_id;
  if not found then raise exception 'item_not_found' using errcode='P0002'; end if;
  return jsonb_build_object('ok',true);
end; $$;
revoke all on function public.admin_delete_item(uuid) from public;
grant execute on function public.admin_delete_item(uuid) to authenticated;
notify pgrst, 'reload schema';
