# MIMICAL 1.1.0.3 — conciliación durante ejecuciones parciales

Estado: candidato probado de forma aislada y aprobado por Mauricio para su
publicación en NODAL App el 2 de noviembre de 2026. La publicación no sustituye
automáticamente la DLL que cada persona ya tenga cargada en NinjaTrader.

## Evidencia y causa

Incidente del 02/11/2026, hora Argentina. Fuente: registro MIMICAL
`20261102_065730_166.tsv` y registro NinjaTrader `log.20261102.00004.txt`.
La inspección de la aplicación confirmó las ejecuciones y que actualmente no hay
posiciones abiertas. MIMICAL volvió a estar activo después del cierre del grupo.

- 06:58:15: la líder compra 2 NQ y la copia vende correctamente 2 MNQ.
- La líder recibe dos ejecuciones de 1; Sim101 recibe una ejecución de 2.
- 06:58:17.021: la orden líder confirma Filled=2.
- 06:58:17.739: MIMICAL bloquea comparando la posición líder aún en 1 contra -2.
- 06:58:18.048: NinjaTrader actualiza la posición líder a 2, 309 ms después.
- El cierre posterior de la líder no se copia porque el motor ya está bloqueado;
  Sim101 se cierra por separado a las 06:59:14.

La tolerancia anterior de dos segundos medía desde la primera discrepancia sin
considerar cambios de cantidades ni progreso de fills. Una orden Filled no implica
que el evento Position correspondiente ya haya sido procesado.

## Cambio técnico

`Mimical.cs`: `Reconcile`, observación en `OnOrder`, `OnExecution`, `OnPosition`
y decisión determinista `MimicalPositionCheck.ShouldBlock`.

- Reinicia la espera cuando cambia esperado/real o llega progreso de ejecución.
- Conserva dos segundos para una diferencia estable sin fills pendientes.
- Con órdenes Market activas o PartFilled, permite hasta 15 segundos sin progreso
  antes de bloquear por estancamiento. Las órdenes Limit/Stop normales pendientes
  no suspenden el control. El plazo es técnico, no una regla de ruta.
- Una revisión de eventos invalida una lectura de cuentas que atravesó cambios
  de orden, ejecución o posición. Se vuelve a leer en el siguiente ciclo.
- Los datos de progreso se restringen a cuentas/instrumentos configurados.
- Cada seguidora conserva su observación independiente. Una coincidencia limpia
  su espera. Los ciclos siguientes no heredan los tiempos del anterior.

Este cambio previene el bloqueo prematuro identificado. No cambia la política
general de `Trip`: un bloqueo real aún detiene la copia y requiere revisar las
posiciones. No introduce órdenes automáticas de compensación ni altera ratios,
trailing, Cross Order, licencias o la transformación de tipos de orden.

## Validación

- Compilación de las variantes personal e identidad.
- 48 pruebas ejecutan la decisión compilada con reloj determinista: tiempos del
  incidente, compras/cierres/ventas consecutivas, parcialidades, actualización
  tardía, diferencia persistente, orden estancada y reinicio de ciclo.
- Regresiones: 51 controles generales; 31 de entrada cruzada; 324 de Stop Limit;
  9 de licencia. Se comprueba también evidencia SIM histórica de entradas cruzadas.
- Las pruebas aisladas no equivalen a una nueva operación interactiva en Ninja.

FileVersion: 1.1.0.3. AssemblyVersion sigue 1.1.0.0; licencia conserva su protocolo.
CONFIG identifica `build=1.1.0.3-position-settlement`.
Se preserva la separación personal/identidad agregada en 1.1.0.2.
La barra de título y el encabezado muestran el FileVersion completo leído del
DLL (`1.1.0.3` en este candidato), en lugar del rótulo ambiguo `1.1`.

## Entrega y recuperación

Candidato personal: `MIMICAL-1.1.0.3-NodalBots-SIM.zip`.
Candidato identidad: `MIMICAL-1.1.0.3-NodalBots-Identity-SIM.zip`.
La palabra SIM identifica el estado de validación del paquete; NO restringe
técnicamente las cuentas a simulación. Probar primero sólo con cuentas SIM.

Importar con el grupo sin posiciones ni órdenes pendientes y reiniciar NinjaTrader.
Comprobar el identificador CONFIG nuevo; repetir compra/cierre/venta con dos
contratos y Cross Order, corroborando posiciones, cierres y salidas ATM en ambas
cuentas. Verificar trailing activado/desactivado en una prueba separada.

Respaldo previo: `outputs/mimical_reconcile_20261102/` contiene fuentes y ZIPs
anteriores. Para rollback, reimportar el paquete previo del mismo alcance y
reiniciar con el grupo sin exposición. El 2 de noviembre de 2026 ambos paquetes
sustituyeron los canales personal e identidad de la App. No se modificó el
archivo de Drive mediante este cambio.
