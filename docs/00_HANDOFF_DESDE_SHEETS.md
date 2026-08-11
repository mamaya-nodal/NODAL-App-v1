# Handoff desde el sistema de Google Sheets

## Proposito

Este documento conecta el conocimiento canonico de NODAL con el inicio de la
aplicacion. No reemplaza las fuentes de Core, Contabilidad ni Operaciones.
Registra el punto desde el cual comienza el nuevo proyecto y evita que un hilo
nuevo dependa del historial de una conversacion.

## Fecha de preparacion

- `2026-08-03`.

## Sistema actual

NODAL opera con una Plantilla Maestra de Google Sheets, Apps Script y un Panel
Central en Google Workspace. Cada participante puede recibir una planilla
mensual Real y una Practica. Los administradores no computan comision de mesa.

La plantilla vigente concentra Compras General, Control Diario, Registro de
Operaciones, Resumen Operativo y hojas internas. Caja Acumulada y Saldos
Totales dejaron de ser dependencias del modelo actual.

## Funciones relevantes ya existentes

- compras con fecha, empresa, referencia, estado, precio manual y origen;
- Control Diario con saldo, deposito o retiro, resultado, empresa, lider y fase;
- Registro de Operaciones por cuenta, carga, guardado, limpieza y replicas;
- estados Cuenta virgen, Cuenta viva y Cuenta cerrada;
- resumen mensual, semanal, historico y conciliaciones;
- retiros de fondeo pendientes y cobrados;
- comision estimada de mesa y ganancia estimada del trader;
- aprovisionamiento Real y Practica;
- backups, recuperacion, alertas, auditoria y monitor de copias;
- actualizaciones centralizadas con version, checkpoint, backup, aplicacion por
  lotes y verificacion de planillas existentes.

## Ajustes posteriores al corte documental inicial

Durante el piloto se corrigieron o revisaron, entre otros, estos comportamientos:

- el precio de compra paso a ser manual y dejo de depender de un dropdown;
- la hoja Alertas Nodal se ubica despues de Resumen Operativo;
- Config y otras hojas internas deben permanecer ocultas para usuarios;
- se restituyeron los campos visibles de saldos iniciales en Resumen Operativo;
- se ajustaron protecciones que impedian a alumnos limpiar o replicar cuentas;
- se revisaron dropdowns que no incorporaban referencias recientemente compradas;
- se probaron actualizaciones de copias existentes sin borrar informacion cargada;
- las incidencias de Ivo y Julian se utilizaron como regresiones del piloto.

Estos puntos describen cambios e incidentes del piloto. Antes de portar una
formula, rango o funcion concreta, debe verificarse la fuente remota vigente de
acuerdo con Contabilidad y Gestion. No debe asumirse que una instantanea local
antigua representa produccion.

## Estado de continuidad

Al comenzar la aplicacion, el sistema actual no debe considerarse finalizado:

- seguridad y permisos: parciales y en validacion con usuarios reales;
- ciclo mensual: pendiente de formalizacion;
- Panel CRM y vista ejecutiva: parciales;
- auditoria determinista: parcial;
- despliegue de usuarios reales: gradual;
- IA investigadora: futura;
- integraciones con broker o NinjaTrader: futuras.

El hilo dedicado a Google Sheets conserva la responsabilidad de terminar esos
pendientes. El hilo de NODAL App puede estudiarlos y preparar equivalencias,
pero no debe intentar resolverlos modificando el sistema actual.

## Regla de comunicacion entre hilos

Una regla nueva o modificada en el sistema actual debe documentarse en el area
propietaria. La aplicacion consumira esa fuente y registrara el impacto en sus
decisiones o pruebas. Los chats no son fuente de verdad y no deben sincronizarse
copiando conversaciones completas.
