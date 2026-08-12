# Estado inicial del desarrollo

- Fecha de ultima verificacion: `2026-08-12`
- Estado: base local, autenticacion Google y contexto operativo verificadas
- Datos reales: ninguno; solo contexto de desarrollo del responsable NODAL
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
    workspace/domain/          Seleccion segura de modalidad y periodo
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
| Pruebas automatizadas | 52 de 52 aprobadas. |
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
| Espacios del primer usuario | `Real` y `Practica` creados y aislados. |
| Periodo de desarrollo | Agosto de 2026 disponible en ambas modalidades. |
| Selector de contexto | Cambio Real/Practica y periodo mensual aprobado de extremo a extremo. |
| Parametros manipulados | Un mes inexistente se reemplaza por un contexto existente y permitido. |
| Formulario inicial de compra | Muestra solo empresa, precio y origen de fondos. |
| Catalogos de compra | Solo `FFF`, `LUCID`, `TRADEFY`, `Aporte trader` y `Saldo generado`. |
| Alta transaccional | Fecha, numero, referencia, cuenta virgen y auditoria se generan juntos. |
| Seguridad de compras | Sin escritura directa del navegador; funcion validada solo para usuario autorizado y periodo propio. |
| Nucleo de Control Diario | Depositos, retiros y actualizaciones de saldo calculados con centavos enteros y sin mezclar capital con resultado. |
| Vista previa de Control Diario | Simulacion interactiva aprobada: deposito USD 5.000 y saldo USD 5.500 producen resultado +USD 500. |
| Seleccion operativa | Empresa, cuenta lider, fase y replicas explicitas preparadas exclusivamente con cuentas existentes del periodo. |
| Aislamiento de cuentas | Cada empresa carga su propia grilla; la lider no puede figurar tambien como replica. |
| Ausencia de persistencia | Tras recargar, saldo e historial simulados desaparecen; no se escriben datos en Supabase. |

En este equipo Windows, el servidor local debe iniciarse con el certificado de
confianza `supabase/.temp/windows-ca.pem` mediante `NODE_EXTRA_CA_CERTS`. El
archivo es local, esta ignorado por Git y no se desactiva la validacion TLS.

## Lo que deliberadamente no se hizo

- no se publico en Vercel;
- no se copiaron datos de alumnos ni de la Plantilla Maestra;
- no se modifico Sheets, Apps Script ni Panel Central;
- no se creo ninguna compra ficticia para completar una prueba visual.
- no se inventaron colores para las empresas: su correspondencia exacta sigue pendiente de validacion.
- no se concedio acceso NODAL automaticamente al usuario autenticado.
- no se definio ni automatizo la apertura o el cierre mensual.

## Siguiente etapa tecnica

La siguiente etapa debe probar la grilla completa con cuentas de desarrollo
creadas conscientemente por el responsable NODAL y preparar el registro
transaccional de Control Diario. La
correccion de compras anteriores y el guardado operativo definitivo siguen
bloqueados hasta validar sus campos y casos de equivalencia. Todavia no se
habilitan datos reales ni acceso general de alumnos.

Antes de crear cuentas externas se indicara al responsable de NODAL que debe
hacer, que acceso conservar y que costo puede generar.
