alter table public.spools add column if not exists finished_at timestamptz;
create or replace function public.preserve_spool_lifecycle()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if TG_OP = 'UPDATE' then
  if OLD.deleted_at is not null then
   return OLD;
  end if;
  if OLD.finished_at is not null then
   NEW.finished_at := OLD.finished_at;
   NEW.remaining_weight := 0;
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
create trigger preserve_spool_lifecycle before insert or update on public.spools
for each row execute function public.preserve_spool_lifecycle();


