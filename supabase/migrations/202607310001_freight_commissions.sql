-- Galvão Express: controle pessoal de fretes e comissões.
-- Preserva transportadoras e dados úteis, converte operações existentes para Frete
-- e remove apenas campos da regra antiga que não serão mais usados.

alter table public.freights add column if not exists cte_number text not null default '';
alter table public.freights add column if not exists commission_percent numeric(5, 2) not null default 15;
alter table public.freights add column if not exists commission_status text not null default 'pendente';
alter table public.freights add column if not exists updated_at timestamptz not null default now();

insert into public.carriers (name, phone, active)
values ('Maranhão Transportes', '', true)
on conflict (name) do update set active = true;

update public.freights
set carrier_id = coalesce(carrier_id, (select id from public.carriers where name = 'Maranhão Transportes'));

alter table public.freights alter column carrier_id set not null;

update public.freights
set type = 'Frete',
    commission_percent = 15,
    commission_status = case when commission_status = 'recebida' then 'recebida' else 'pendente' end,
    updated_at = coalesce(updated_at, created_at, now());

alter table public.freights alter column commission_percent set default 15;
alter table public.freights alter column commission_percent set not null;
alter table public.freights alter column commission_status set default 'pendente';
alter table public.freights alter column commission_status set not null;

alter table public.freights drop column if exists commission_value;
alter table public.freights add column commission_value numeric(12, 2)
  generated always as (round(freight_value * commission_percent / 100, 2)) stored;

alter table public.freights drop column if exists value_per_km;
alter table public.freights drop column if exists origin_lat;
alter table public.freights drop column if exists origin_lon;
alter table public.freights drop column if exists destination_lat;
alter table public.freights drop column if exists destination_lon;
alter table public.freights drop column if exists distance_km;
alter table public.freights drop column if exists bonus_value;
alter table public.freights drop column if exists maintenance_percent;
alter table public.freights drop column if exists title;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'freights_commission_percent_check') then
    alter table public.freights add constraint freights_commission_percent_check check (commission_percent = 15);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'freights_commission_status_check') then
    alter table public.freights add constraint freights_commission_status_check check (commission_status in ('pendente', 'recebida'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'freights_type_check') then
    alter table public.freights add constraint freights_type_check check (type = 'Frete');
  end if;
end $$;

create or replace function public.set_freights_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists freights_set_updated_at on public.freights;
create trigger freights_set_updated_at
before update on public.freights
for each row execute function public.set_freights_updated_at();

create index if not exists freights_commission_status_idx on public.freights (commission_status);
