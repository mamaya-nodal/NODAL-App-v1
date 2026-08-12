# Estado inicial del desarrollo

- Fecha de ultima verificacion: `2026-08-12`
- Estado: base local y autenticacion Google verificadas
- Datos reales: ninguno
- Servicios externos conectados: GitHub privado, Supabase de desarrollo y
  Google OAuth de desarrollo

## Resultado de esta etapa

NODAL App ya posee un esqueleto tecnico ejecutable. Todavia no es una version
funcional para alumnos: es la base sobre la cual se construiran los modulos sin
mezclar reglas de negocio, interfaz y conexiones externas.

## Herramientas instaladas

| Herramienta | Version inicial bloqueada en `package-lock.json` | Uso |
|---|---:|---|
| Next.js | 16.3.0 | Aplicacion web y servidor. |
| React | 19.2.8 | Interfaz. |
| TypeScript | 6.0.3 | Lenguaje y verificacion de tipos. |
| ESLint | 9.39.5 | Control de calidad del codigo. |
| Vitest | 4.1.10 | Pruebas automaticas. |

TypeScript 7 y ESLint 10 no se utilizaron porque las herramientas actuales de
Next.js presentaron incompatibilidades. Se fijaron versiones compatibles y
reproducibles, sin vulnerabilidades reportadas por la instalacion.

## Estructura creada

```text
src/
  app/                         Pantallas, rutas de autenticacion y estilos
  lib/supabase/                Clientes separados para navegador y servidor
  modules/
    access/domain/             Decision identidad/autorizacion
    control-diario/
      domain/                  Reglas sin interfaz ni base de datos
    purchases/domain/          Reglas confirmadas de compras
supabase/migrations/           Esquema PostgreSQL versionado
docs/                          Conocimiento y decisiones del proyecto
```

El primer archivo de negocio valida reglas ya confirmadas:

1. la suma distribuida entre lider y replicas debe coincidir con el resultado
   total de Control Diario;
2. una perdida economica se convierte en magnitud positiva para
   `NETO BROKER -`;
3. una ganancia se dirige a `NETO BROKER +`.

Los importes de estas reglas se representan internamente en centavos enteros
para evitar errores de redondeo del lenguaje.

## Verificaciones realizadas

| Verificacion | Resultado |
|---|---|
| Pruebas automatizadas | 18 de 18 aprobadas. |
| TypeScript estricto | Aprobado. |
| ESLint | Aprobado. |
| Compilacion de produccion | Aprobada con Next.js 16.3.0. |
| Auditoria de dependencias durante instalacion | 0 vulnerabilidades reportadas. |
| Inicio de sesion Google | Aprobado con el usuario de prueba NODAL. |
| Separacion identidad/autorizacion | Aprobada: identidad valida sin registro activo queda bloqueada. |
| Cierre de sesion | Aprobado. |
| Acceso directo a `/app` sin sesion | Bloqueado y redirigido al inicio. |
| Primer usuario de desarrollo | Autorizado y verificado de extremo a extremo. |
| Alta desde `anon` o `authenticated` | Bloqueada por permisos de PostgreSQL. |
| Alta desde `service_role` | Permitida exclusivamente en servidor privilegiado. |
| Auditoria de autorizaciones | RLS activo y acceso directo del alumno revocado. |

En este equipo Windows, el servidor local debe iniciarse con el certificado de
confianza `supabase/.temp/windows-ca.pem` mediante `NODE_EXTRA_CA_CERTS`. El
archivo es local, esta ignorado por Git y no se desactiva la validacion TLS.

## Lo que deliberadamente no se hizo

- no se publico en Vercel;
- no se copiaron datos de alumnos ni de la Plantilla Maestra;
- no se modifico Sheets, Apps Script ni Panel Central;
- no se implemento aun un formulario operativo.
- no se concedio acceso NODAL automaticamente al usuario autenticado.

## Siguiente etapa tecnica

La siguiente etapa debe crear los espacios iniciales `Real` y `Practica` del
primer usuario de desarrollo y definir como se seleccionara el periodo mensual,
sin habilitar todavia datos reales ni acceso de alumnos.

Antes de crear cuentas externas se indicara al responsable de NODAL que debe
hacer, que acceso conservar y que costo puede generar.
