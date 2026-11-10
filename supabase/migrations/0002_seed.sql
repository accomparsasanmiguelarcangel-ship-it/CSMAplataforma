-- ═══════════════════════════════════════════════════════════════════════════
--  Migración 0002 — Datos iniciales (directiva, configuración, campos)
--  Ejecutar DESPUÉS de crear los usuarios en Supabase Auth y de la 0001.
--  Reemplaza los correos por los reales de la directiva.
-- ═══════════════════════════════════════════════════════════════════════════

insert into public.settings (id, association_name, code_prefix, total_amount, advance_amount,
                            installments, yape_number, yape_holder, docs_require_payment)
values ('global',
        'Asociación Cultural Comparsa San Miguel Arcángel 2004',
        'ASO', 320, 120, 4,
        '987 654 321',
        'Asociación Cultural Comparsa San Miguel Arcángel 2004',
        true)
on conflict (id) do update set
  association_name = excluded.association_name,
  code_prefix = excluded.code_prefix;

insert into public.form_fields (label, key, type, required, options, active, position) values
  ('Talla de vestuario', 'talla', 'select', false, '{S,M,L,XL}', true, 1),
  ('Instrumento que ejecuta', 'instrumento', 'select', false, '{Quena,Tinya,Guitarra,Ninguno}', true, 2),
  ('¿Participa en desfile?', 'desfile', 'select', false, '{Sí,No}', true, 3)
on conflict (key) do nothing;

-- Perfiles de la directiva: vincula por correo con auth.users
-- 1) Crea los usuarios en Authentication > Users.
-- 2) Ejecuta este bloque para asignarles rol.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('admin@arcangel2004.org',     'Directiva — Presidencia', 'superadmin'),
      ('directiva@arcangel2004.org', 'Directiva — Tesorería',   'admin'),
      ('control@arcangel2004.org',   'Control de asistencia',    'controlador')
    ) as t(email, full_name, role)
  loop
    insert into public.profiles (id, email, full_name, role, active)
    select u.id, r.email::citext, r.full_name, r.role::app_role, true
    from auth.users u
    where lower(u.email) = lower(r.email)
    on conflict (id) do update
      set role = excluded.role,
          full_name = excluded.full_name,
          active = true;
  end loop;
end $$;

-- Categorías documentales de referencia
insert into public.documents (title, category, description, requires_payment, published) values
  ('Estatuto de la Asociación', 'Estatutos', 'Documento constitutivo vigente.', false, true),
  ('Reglamento interno', 'Reglamentos internos', 'Normas de convivencia y disciplina.', true, true),
  ('Reglamento de participación y cuotas', 'Reglamentos de participación', 'Cronograma de cuotas y condiciones.', true, true)
on conflict do nothing;
