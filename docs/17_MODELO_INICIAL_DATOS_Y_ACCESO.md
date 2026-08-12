# Modelo inicial de datos y acceso

- Fecha: `2026-08-11`
- Estado: base implementada localmente y aplicada a Supabase de desarrollo
- Datos: exclusivamente estructura y catalogos confirmados, sin alumnos reales

## Proposito

Esta etapa prepara la identidad, el aislamiento entre alumnos, las modalidades,
los periodos y la estructura minima de compras y cuentas. No habilita todavia
un formulario operativo ni reemplaza ninguna funcion de Sheets.

## Estructura confirmada

| Registro | Responsabilidad |
|---|---|
| `nodal_users` | Vincula la identidad de Supabase/Google con la autorizacion previa de NODAL. |
| `access_authorization_events` | Audita cada alta o revocacion de acceso, su responsable y motivo. |
| `workspace_provisioning_events` | Audita la creacion controlada de espacios y periodos iniciales. |
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
7. Las altas y revocaciones solo se ejecutan mediante funciones restringidas al servidor privilegiado o al propietario de la base.
8. La creacion inicial de espacios y periodos tambien esta restringida al servicio privilegiado, exige motivo y deja auditoria.

## Contexto operativo inicial

El primer usuario autorizado de desarrollo posee dos espacios independientes:
`Real` y `Practica`. Ambos tienen un periodo de prueba para agosto de 2026. Este
mes existe solo para construir y comprobar la aplicacion; no define una regla de
apertura automatica ni representa un cierre contable aprobado.

La pantalla permite seleccionar modalidad y uno de los periodos existentes del
usuario. Si se intenta enviar por URL una modalidad o un mes inexistentes, el
servidor usa un contexto valido accesible para ese usuario. No se mezclan datos
entre modalidades y el selector nunca crea registros.

## Reglas de compra ya codificadas

- los unicos origenes vigentes son `Aporte trader` y `Saldo generado`;
- `Capital propio` y cualquier opcion inventada son rechazados;
- una compra nueva genera una `Cuenta virgen`;
- precio e importes se representan en centavos enteros;
- numero general y referencia por empresa son datos automaticos, no campos manuales.
- la fecha de compra se obtiene en el servidor con la zona horaria de Buenos Aires;
- cuenta y compra se crean juntas dentro de una transaccion;
- la numeracion se serializa por periodo para impedir referencias duplicadas;
- cada alta deja una auditoria con usuario, periodo y valores confirmados;
- el alumno no posee permiso de insercion directa sobre `accounts` ni `purchases`.

La pantalla solo pide empresa, precio y origen de fondos. La operacion valida
nuevamente identidad, autorizacion, propiedad del periodo, vigencia de la
empresa, importe y origen dentro de PostgreSQL. La fecha automatica solo se
acepta cuando el periodo seleccionado coincide con el mes calendario actual.

## Deliberadamente pendiente

- matriz definitiva de roles administrativos;
- permisos para aprobar retiros, conciliaciones y cierres;
- politica de apertura y cierre mensual;
- operacion transaccional de correccion de compras;
- politica para una compra cargada tarde o en un periodo historico;
- casos anonimizados para comparar compras contra Sheets.

## Nucleo calculado de Control Diario

El calculo determinista ya preserva estos casos confirmados:

- el primer deposito establece el saldo de referencia sin generar resultado;
- un deposito posterior aumenta ese saldo sin contabilizar una ganancia;
- un retiro reduce el saldo sin contabilizar una perdida;
- un saldo nuevo sin movimiento calcula `saldo nuevo - saldo anterior`;
- la ganancia conserva signo positivo y la perdida, signo negativo;
- todos los importes se procesan en centavos enteros.

Este servicio todavia no guarda registros. Los campos operativos completos, la
seleccion de cuentas y el flujo de correcciones se conectaran solo al validar
los casos que requieren Contabilidad y Operaciones.

La aplicacion incluye una vista previa temporal para comprobar estas reglas sin
crear datos economicos. Mantiene un historial exclusivamente en la memoria de
la pantalla, indica de forma visible `No guarda datos` y elimina todo al
recargar. No solicita empresa, cuenta, replicas ni fase porque esos campos solo
se habilitaran cuando existan cuentas de desarrollo conscientes y se valide el
guardado operativo completo.

Estas decisiones no se completan con valores provisorios. Se agregaran mediante
nuevas migraciones cuando el area propietaria las confirme.

## Limitacion local conocida

La computadora actual no tiene Docker instalado. La migracion fue aplicada y
verificada en el PostgreSQL remoto de desarrollo, pero todavia no puede
reproducirse con `db reset` en una base local. Esto no afecta las pruebas
TypeScript ni autoriza el uso de datos reales.
