# Modelo inicial de datos y acceso

- Fecha: `2026-08-11`
- Estado: primera base implementada localmente; pendiente de vincular a Supabase
- Datos: exclusivamente estructura y catalogos confirmados, sin alumnos reales

## Proposito

Esta etapa prepara la identidad, el aislamiento entre alumnos, las modalidades,
los periodos y la estructura minima de compras y cuentas. No habilita todavia
un formulario operativo ni reemplaza ninguna funcion de Sheets.

## Estructura confirmada

| Registro | Responsabilidad |
|---|---|
| `nodal_users` | Vincula la identidad de Supabase/Google con la autorizacion previa de NODAL. |
| `workspaces` | Separa los espacios `Real` y `Practica` de cada alumno. |
| `periods` | Separa la informacion por mes dentro de cada modalidad. |
| `companies` | Conserva el catalogo vigente y su validez temporal. |
| `accounts` | Identifica una cuenta por periodo, empresa y referencia. |
| `purchases` | Conserva numero, fecha, precio, origen y cuenta creada. |
| `audit_events` | Reserva la traza interna de acciones y correcciones sensibles. |

El catalogo inicial incluye `FFF`, `LUCID` y `TRADEFY`. Se conocen como
vigentes, pero su fecha historica de alta no esta confirmada; por eso esa fecha
queda vacia en vez de completarse con una suposicion.

Las referencias se separan por empresa y periodo, de la misma manera en que una
plantilla mensual cuenta las compras anteriores de esa empresa. Los numeros se
asignaran dentro de una transaccion del servidor para evitar duplicados cuando
dos acciones ocurran al mismo tiempo.

## Seguridad aplicada desde el inicio

1. Iniciar sesion con Google solo establece identidad.
2. El registro NODAL debe estar en estado `active` para acceder a espacios y datos.
3. Las politicas RLS filtran cada registro por el usuario autenticado.
4. No existen politicas de escritura economica directa para el navegador.
5. La auditoria interna tampoco es consultable directamente desde el navegador.
6. Las claves administrativas no forman parte del codigo ni de las variables publicas.

## Reglas de compra ya codificadas

- los unicos origenes vigentes son `Aporte trader` y `Saldo generado`;
- `Capital propio` y cualquier opcion inventada son rechazados;
- una compra nueva genera una `Cuenta virgen`;
- precio e importes se representan en centavos enteros;
- numero general y referencia por empresa son datos automaticos, no campos manuales.

## Deliberadamente pendiente

- matriz definitiva de roles administrativos;
- permisos para aprobar retiros, conciliaciones y cierres;
- politica de cierre mensual;
- operacion transaccional completa de alta y correccion de compras;
- proyecto remoto, region y plan de Supabase;
- credenciales OAuth de Google;
- casos anonimizados para comparar compras contra Sheets.

Estas decisiones no se completan con valores provisorios. Se agregaran mediante
nuevas migraciones cuando el area propietaria las confirme.

## Limitacion local conocida

La computadora actual no tiene Docker instalado. Por eso la migracion queda
revisable y versionada, pero su ejecucion real en PostgreSQL se comprobara al
crear el proyecto Supabase de desarrollo o al disponer de un entorno local
compatible. Esto no afecta las pruebas TypeScript, pero impide afirmar todavia
que la migracion fue aplicada exitosamente a una base real.
