begin;

alter table public.freights
  drop constraint if exists freights_operation_values_check;

update public.freights
set empty_return_amount = 100
where operation_kind = 'empty_return'
  and equipment_type = 'carreta_ls'
  and empty_return_amount = 300;

alter table public.freights
  add constraint freights_operation_values_check check (
    (operation_kind = 'freight' and freight_value > 0 and empty_return_amount = 0)
    or
    (operation_kind = 'empty_return' and freight_value = 0 and empty_return_amount > 0)
  );

commit;
