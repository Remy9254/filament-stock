-- Additive correction support. Existing records and ownership policies are preserved.
alter table public.spools add column correction_revision integer not null default 0;
alter table public.spools add column corrections jsonb not null default '[]'::jsonb;
alter table public.movements add column cancelled_at timestamptz;

create or replace function public.preserve_spool_lifecycle()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if TG_OP = 'UPDATE' then
  if NEW.correction_revision < OLD.correction_revision then return OLD; end if;
  if NEW.correction_revision = OLD.correction_revision then
   NEW.corrections := OLD.corrections;
   if OLD.deleted_at is not null then return OLD; end if;
   if OLD.finished_at is not null then
    NEW.finished_at := OLD.finished_at; NEW.remaining_weight := 0;
   end if;
  end if;
 end if;
 if NEW.remaining_weight <= 0 and NEW.deleted_at is null then
  NEW.finished_at := coalesce(NEW.finished_at, now());
 end if;
 if NEW.finished_at is not null then NEW.remaining_weight := 0; end if;
 if NEW.deleted_at is not null or NEW.finished_at is not null then NEW.shelf_slot := null; end if;
 return NEW;
end;
$$;

create function public.preserve_movement_cancellation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if OLD.cancelled_at is not null then return OLD; end if;
 return NEW;
end;
$$;
create trigger preserve_movement_cancellation before update on public.movements
for each row execute function public.preserve_movement_cancellation();

create function public.correct_stock(p_action text,p_target uuid,p_revision integer,p_remaining numeric,p_weight numeric default null)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
 s public.spools%rowtype; m public.movements%rowtype; spool_uuid uuid;
 new_weight numeric; free_slot integer; event_label text; event_time timestamptz := now();
begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if p_action = 'cancel' then
  select spool_id into spool_uuid from public.movements where id=p_target and user_id=auth.uid();
 else spool_uuid := p_target;
 end if;
 select * into s from public.spools where id=spool_uuid and user_id=auth.uid() for update;
 if not found then raise exception 'SPOOL_NOT_FOUND'; end if;
 if p_action = 'cancel' then
  select * into m from public.movements where id=p_target and user_id=auth.uid() for update;
  if not found or m.grams >= 0 or m.deleted_at is not null then raise exception 'INVALID_MOVEMENT'; end if;
  -- Retrying a completed request must never return the grams twice.
  if m.cancelled_at is not null then return jsonb_build_object('spool',to_jsonb(s),'movement',to_jsonb(m)); end if;
 end if;
 if p_revision is distinct from s.correction_revision or p_remaining is distinct from s.remaining_weight then raise exception 'STOCK_CHANGED'; end if;
 if p_action = 'cancel' then
  new_weight := s.remaining_weight - m.grams;
  if new_weight > s.initial_weight then raise exception 'WEIGHT_EXCEEDS_INITIAL'; end if;
  update public.movements set cancelled_at=event_time where id=m.id returning * into m;
  event_label := 'Consommation annulée';
 elsif p_action = 'restore' then
  if s.deleted_at is null and s.finished_at is null and s.remaining_weight>0 then raise exception 'ALREADY_ACTIVE'; end if;
  new_weight := coalesce(p_weight,s.remaining_weight);
  if new_weight is null or new_weight <= 0 or new_weight > s.initial_weight or new_weight::text in ('NaN','Infinity','-Infinity') then raise exception 'INVALID_WEIGHT'; end if;
  event_label := 'Bobine remise en stock';
 else raise exception 'INVALID_ACTION';
 end if;
 free_slot := s.shelf_slot;
 if (p_action='restore' or s.deleted_at is null) and (free_slot is null or exists(select 1 from public.spools where user_id=auth.uid() and id<>s.id and deleted_at is null and finished_at is null and remaining_weight>0 and shelf_slot=free_slot)) then
  select candidate into free_slot from generate_series(0,(select count(*)::integer from public.spools where user_id=auth.uid())) candidate
  where not exists(select 1 from public.spools where user_id=auth.uid() and id<>s.id and deleted_at is null and finished_at is null and remaining_weight>0 and shelf_slot=candidate) order by candidate limit 1;
 end if;
 update public.spools set remaining_weight=new_weight,finished_at=null,
  deleted_at=case when p_action='restore' then null else s.deleted_at end,
  shelf_slot=free_slot,correction_revision=s.correction_revision+1,
  corrections=s.corrections || jsonb_build_array(jsonb_build_object('date',event_time,'label',event_label,'grams',case when p_action='cancel' then -m.grams else new_weight-s.remaining_weight end,'previousDeletedAt',s.deleted_at,'previousFinishedAt',s.finished_at))
 where id=s.id returning * into s;
 return jsonb_build_object('spool',to_jsonb(s),'movement',case when p_action='cancel' then to_jsonb(m) else null end);
end;
$$;
revoke all on function public.correct_stock(text,uuid,integer,numeric,numeric) from public,anon;
grant execute on function public.correct_stock(text,uuid,integer,numeric,numeric) to authenticated;

