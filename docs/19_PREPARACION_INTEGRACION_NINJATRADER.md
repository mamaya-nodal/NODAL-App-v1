# Preparacion de integracion NinjaTrader

Estado: preparacion tecnica. No conecta cuentas, no recibe saldos reales y no
reemplaza Control Diario.

## Lo confirmado por la documentacion oficial

NinjaTrader 8 expone los valores de cada cuenta dentro de NinjaScript. Un Add
On local puede suscribirse a `AccountItemUpdate` y recibir el nombre de la
cuenta, el tipo de valor, moneda, momento y nuevo valor. Tambien puede leer un
valor puntual de una cuenta.

No todos los proveedores conectados transmiten los mismos valores de cuenta.
Por lo tanto, NODAL no debe asumir que `CashValue`, `NetLiquidation` u otro
campo equivale sin validacion al `Nuevo saldo` utilizado actualmente en Sheets.

## Arquitectura prevista

```text
NinjaTrader instalado por el trader
          |
          | Add On local, sin credenciales NODAL visibles
          v
Servicio receptor privado de NODAL
          |
          | valida origen, formato e idempotencia
          v
Revision obligatoria en NODAL App
          |
          | contexto ya preparado: empresa, lider, replicas y fase
          v
Confirmacion del alumno
          |
          v
Transaccion existente de Control Diario + registros por cuenta
```

La app ya cubre la ultima parte del flujo: conserva la clave de evento,
impide duplicarla, muestra el saldo recibido y exige confirmar o informar una
contingencia con motivo y saldo corregido. La recepcion actual es una
simulacion de desarrollo; nunca representa conexion real.

## Reglas que se preservan

1. Un saldo externo no crea registros economicos solo por llegar.
2. Empresa, cuenta lider, replicas y fase deben estar preparados antes de
   confirmar el saldo.
3. El dato original recibido se conserva. Si se corrige, la diferencia exige
   motivo y auditoria.
4. La misma clave de evento no puede generar un segundo Control Diario.
5. Si el contexto no esta preparado, el sistema bloquea la siguiente recepcion
   hasta resolver la revision; no existe una cola manual normal para el alumno.
6. NinjaTrader no podra enviar ordenes, operar cuentas ni modificar estados de
   NODAL.
7. Ninguna clave, token del broker o secreto del receptor se almacena en este
   repositorio.

## Validaciones necesarias antes de conectar una cuenta

Estas validaciones no son decisiones tecnicas opcionales: determinan el
significado economico del saldo y por eso requieren evidencia de una cuenta
real de prueba.

| Validacion | Por que importa | Evidencia requerida |
|---|---|---|
| Campo de NinjaTrader equivalente a `Nuevo saldo` | `CashValue`, `NetLiquidation` y otros valores no siempre coinciden. | Comparar una jornada conocida contra Control Diario y Sheets. |
| Identidad de cuenta | El nombre o identificador recibido debe mapearse a un alumno y a una cuenta NODAL sin ambiguedad. | Lista de nombres/identificadores anonimizados por proveedor. |
| Grupo replicado | Debe definirse si llega un saldo por cuenta fisica, por cuenta lider o por grupo. | Una operacion real con lider y replicas, comparada contra el registro actual. |
| Momento de lectura | Los cambios pueden recibirse varias veces durante una operacion. | Secuencia de eventos de una jornada de prueba. |
| Disponibilidad por proveedor | Algunos proveedores transmiten datos parciales. | Prueba de conexion para cada empresa utilizada. |

## Siguiente subpaso

Realizar una prueba no productiva con una sola empresa y una cuenta de prueba.
Primero se observa y registra la secuencia de valores; todavia no se escribe en
NODAL. Con esa evidencia se construye el Add On local en C# (lenguaje requerido
por NinjaScript) y el receptor privado de la app. El backend de NODAL sigue en
TypeScript; el Add On es un conector separado y minimo.
