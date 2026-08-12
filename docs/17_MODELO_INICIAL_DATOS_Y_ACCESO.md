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
| `daily_controls` | Conserva la secuencia de saldo, movimiento, contexto, fuente y confirmacion. |
| `daily_control_participants` | Vincula cada control con su lider y replicas explicitas. |
| `operation_entries` | Conserva el registro derivado por cuenta, fase y destino broker. |

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

Este servicio todavia no guarda registros. La pantalla ya prepara la seleccion
de empresa, cuenta lider, fase y replicas, pero el flujo de correcciones se
conectara solo al validar los casos que requieren Contabilidad y Operaciones.

La aplicacion incluye una vista previa temporal para comprobar estas reglas sin
crear datos economicos. Mantiene un historial exclusivamente en la memoria de
la pantalla, indica de forma visible `No guarda datos` y elimina todo al
recargar.

La seleccion operativa usa exclusivamente cuentas ya compradas en el periodo:

- cada empresa muestra su propia grilla y su numeracion correlativa;
- la cuenta lider se elige por separado y nunca aparece como replica;
- las replicas se seleccionan una por una, por lo que pueden ser no consecutivas;
- al cambiar de empresa se limpian lider y replicas;
- al quitar la lider tambien se limpian las replicas;
- las seis fases conservan los nombres vigentes del sistema de referencia.

Cuando la ultima carga produce un resultado operativo, la vista previa muestra
una fila por cuenta participante, identifica lider y replicas, dirige ganancias
a `NETO BROKER +` y perdidas a `NETO BROKER -`, y comprueba que la suma coincide
exactamente con el total. Si el total no se puede dividir en centavos iguales,
la app informa la situacion y no habilita la confirmacion. El ajuste particular
por cuenta se confirma mediante un flujo excepcional explícito; no se asignan
diferencias silenciosamente.

No se crearon cuentas ficticias para forzar una demostracion. Por eso, hasta
que exista una compra consciente de desarrollo, la interfaz informa que la
empresa seleccionada no tiene cuentas. La asignacion visual de colores por
empresa queda pendiente: las fuentes leidas no confirman la correspondencia
exacta y la aplicacion no la inventa.

Estas decisiones no se completan con valores provisorios. Se agregaran mediante
nuevas migraciones cuando el area propietaria las confirme.

## Persistencia transaccional preparada

La migracion `20260812030000_daily_control_transaction.sql` crea una unica
funcion validada para confirmar un Control Diario. Dentro de la misma
transaccion:

1. valida identidad, autorizacion, periodo y orden de fecha;
2. obtiene y bloquea la secuencia del periodo;
3. calcula el nuevo saldo y el resultado desde el ultimo saldo confirmado;
4. valida empresa, lider, replicas, fase y reparto exacto;
5. guarda el Control Diario;
6. guarda los participantes;
7. crea una entrada derivada por cuenta;
8. registra auditoria;
9. devuelve el registro ya creado si se repite la misma confirmacion o evento
   de NinjaTrader.

El alumno puede leer exclusivamente los registros de sus periodos mediante
RLS, pero no puede insertar, modificar ni eliminar directamente ninguna de las
tres tablas. El boton visual todavia no llama a esta funcion. La activacion
queda condicionada a las pruebas reversibles de equivalencia y al calculo de
estado de cuenta, que no se completo con una regla parcial.

La transaccion fue comprobada remotamente dentro de `BEGIN` y `ROLLBACK` con un
periodo y cuentas temporales: deposito de USD 5.000, saldo NinjaTrader de USD
5.600, resultado de USD 600 y tres entradas de USD 200. Tambien se probaron la
auditoria, la repeticion del evento sin duplicados y el bloqueo de una division
no exacta. Una consulta posterior confirmo que no quedo ningun registro de esa
prueba en la base.

El calculo de estado ya existe como servicio determinista y reproduce la regla
propietaria de virgen, viva y cerrada. Todavia no escribe `accounts.state`: un
resultado de broker aislado no equivale al `TOTAL GANANCIA` completo de una
fase, que tambien depende de campos operativos pendientes de modelar.

Una lectura acotada de `PLANTILLA_LIMPIA!A1:F70` permitio separar dos capas:

- el calculo contable confirmado de cada fase suma `NETO BROKER +`, resta
  `NETO BROKER -` y agrega `TOTAL RETIRO` cuando corresponde;
- si el total es negativo, su magnitud se arrastra a la fase siguiente;
- el origen de `TOTAL RETIRO` depende de parametros operativos especificos que
  no se copiaron ni se completaron por inferencia.

La primera capa ya existe como servicio determinista. La segunda permanece
pendiente de aprobacion y casos anonimizados. La consulta a Google Sheets fue
exclusivamente de lectura.

## Limitacion local conocida

La computadora actual no tiene Docker instalado. La migracion fue aplicada y
verificada en el PostgreSQL remoto de desarrollo, pero todavia no puede
reproducirse con `db reset` en una base local. Esto no afecta las pruebas
TypeScript ni autoriza el uso de datos reales.
