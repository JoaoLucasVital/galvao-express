begin;

update public.freights
set commission_status = 'recebida'
where commission_status is distinct from 'recebida';

alter table public.freights
  alter column commission_status set default 'recebida';

alter table public.freights
  drop constraint if exists freights_commission_status_check;

alter table public.freights
  add constraint freights_commission_status_check
  check (commission_status = 'recebida');

drop index if exists public.freights_commission_status_idx;

commit;