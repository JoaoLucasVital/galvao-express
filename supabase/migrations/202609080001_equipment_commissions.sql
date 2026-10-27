begin;

alter table public.freights
  add column if not exists operation_kind text not null default 'freight',
  add column if not exists equipment_type text not null default 'carreta_ls',
  add column if not exists loading_at timestamp without time zone;

update public.freights
set loading_at = freight_date + time '12:00'
where loading_at is null;

alter table public.freights
  alter column loading_at set default localtimestamp,
  alter column loading_at set not null,
  alter column equipment_type set default 'carreta_ls',
  alter column operation_kind set default 'freight';

alter table public.freights
  drop constraint if exists freights_commission_percent_check,
  drop constraint if exists freights_equipment_type_check,
  drop constraint if exists freights_operation_kind_check,
  drop constraint if exists freights_equipment_commission_check;

update public.freights
set equipment_type = 'carreta_ls',
    operation_kind = 'freight',
    commission_percent = 15
where equipment_type not in ('bitrem_30m', 'carreta_ls')
   or operation_kind not in ('freight', 'empty_return')
   or commission_percent not in (13, 15)
   or (equipment_type = 'bitrem_30m' and commission_percent <> 13)
   or (equipment_type = 'carreta_ls' and commission_percent <> 15);

alter table public.freights
  add constraint freights_commission_percent_check check (commission_percent in (13, 15)),
  add constraint freights_equipment_type_check check (equipment_type in ('bitrem_30m', 'carreta_ls')),
  add constraint freights_operation_kind_check check (operation_kind in ('freight', 'empty_return')),
  add constraint freights_equipment_commission_check check (
    (equipment_type = 'bitrem_30m' and commission_percent = 13)
    or (equipment_type = 'carreta_ls' and commission_percent = 15)
  );

do $$
declare
  old_id bigint;
  target_id bigint;
begin
  select id into old_id from public.carriers where name = 'Maranhão Transportes' limit 1;
  select id into target_id from public.carriers where name = 'Scarpress - Shopee' limit 1;

  if target_id is null and old_id is not null then
    update public.carriers
    set name = 'Scarpress - Shopee', active = true
    where id = old_id;
  elsif target_id is null then
    insert into public.carriers (name, phone, active)
    values ('Scarpress - Shopee', '', true);
  elsif old_id is not null and old_id <> target_id then
    update public.freights set carrier_id = target_id where carrier_id = old_id;
    delete from public.carriers where id = old_id;
    update public.carriers set active = true where id = target_id;
  else
    update public.carriers set active = true where id = target_id;
  end if;
end $$;

create index if not exists freights_loading_at_idx on public.freights (loading_at desc);
create index if not exists freights_equipment_idx on public.freights (equipment_type);

commit;