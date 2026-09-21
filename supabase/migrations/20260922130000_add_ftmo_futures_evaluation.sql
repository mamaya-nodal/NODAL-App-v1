-- FTMO Futures queda disponible en el catalogo y sus evaluaciones Growth 50K
-- pueden registrarse desde NinjaTrader. Las fases funded y live se incorporaran
-- cuando exista evidencia real de su nomenclatura.
insert into public.companies (code, display_name)
values ('FTMO', 'FTMO')
on conflict (code) do update
set display_name = excluded.display_name;
