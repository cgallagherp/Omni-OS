-- Atomic approval of a quarterly reset. SECURITY INVOKER: RLS applies to every
-- statement, and an explicit admin check gives a clear error.
create or replace function public.approve_quarterly_reset(p_reset_id uuid, p_snapshot jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.quarterly_resets%rowtype;
begin
  select * into r from public.quarterly_resets where id = p_reset_id;
  if not found then
    raise exception 'Quarterly reset not found' using errcode = 'P0001';
  end if;
  if not app.can_admin(r.company_id) then
    raise exception 'Only company administrators can approve the quarterly plan' using errcode = '42501';
  end if;
  if r.status = 'approved' then
    raise exception 'This quarterly plan has already been approved' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.quarterly_priorities where quarter_id = r.to_quarter_id) then
    raise exception 'Add at least one priority for the next quarter before approving' using errcode = 'P0001';
  end if;

  -- Close out the previous quarter: anything not done is recorded as missed.
  update public.quarterly_priorities
     set status = 'missed'
   where quarter_id = r.from_quarter_id and status not in ('done', 'missed');
  update public.quarters set status = 'closed' where id = r.from_quarter_id;
  update public.quarters
     set status = 'active', approved_at = now(), approved_by = auth.uid()
   where id = r.to_quarter_id;
  -- New priorities start on track.
  update public.quarterly_priorities
     set status = 'on_track'
   where quarter_id = r.to_quarter_id and status = 'not_started';
  update public.quarterly_resets
     set status = 'approved', approved_at = now(), approved_by = auth.uid(), summary_snapshot = p_snapshot
   where id = p_reset_id;
end $$;

grant execute on function public.approve_quarterly_reset(uuid, jsonb) to authenticated;
