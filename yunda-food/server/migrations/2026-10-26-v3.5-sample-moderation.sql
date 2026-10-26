-- v3.5：把前端起始示例纳入云端管理员可见性控制；不删除任何示例源文件或真实数据。
create table if not exists public.sample_visibility (
  sample_id text primary key,
  hidden boolean not null default false,
  reason text,
  updated_at timestamptz not null default now()
);
alter table public.sample_visibility enable row level security;

create or replace function public.hidden_sample_ids()
returns jsonb language sql security definer set search_path=public,pg_temp as $$
  select coalesce(jsonb_agg(sample_id), '[]'::jsonb) from public.sample_visibility where hidden=true;
$$;

create or replace function public.admin_set_sample_visibility(p_sample_id text, p_hidden boolean, p_reason text default null)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not public.is_admin() then raise exception 'admin_required' using errcode='42501'; end if;
  if p_sample_id is null or char_length(btrim(p_sample_id)) = 0 then raise exception 'invalid_sample_id' using errcode='22023'; end if;
  if p_hidden and (p_reason is null or char_length(btrim(p_reason)) < 2 or not public.yffd_text_is_safe(p_reason)) then raise exception 'invalid_hidden_reason' using errcode='22023'; end if;
  insert into public.sample_visibility(sample_id,hidden,reason,updated_at) values(btrim(p_sample_id),p_hidden,case when p_hidden then btrim(p_reason) else null end,now())
  on conflict(sample_id) do update set hidden=excluded.hidden, reason=excluded.reason, updated_at=now();
  return jsonb_build_object('ok',true);
end; $$;
revoke all on public.sample_visibility from anon, authenticated;
revoke all on function public.hidden_sample_ids(), public.admin_set_sample_visibility(text,boolean,text) from public;
grant execute on function public.hidden_sample_ids() to anon, authenticated;
grant execute on function public.admin_set_sample_visibility(text,boolean,text) to authenticated;
notify pgrst, 'reload schema';
