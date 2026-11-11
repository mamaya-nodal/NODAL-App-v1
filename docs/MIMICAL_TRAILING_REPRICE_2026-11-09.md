# MIMICAL 1.1.0.5 — reubicación del stop rechazado

## Objetivo

Evitar que una carrera de mercado durante el movimiento del stop interrumpa el
trailing o cierre prematuramente la cobertura.

## Comportamiento

1. El último stop aceptado por NinjaTrader se mantiene como protección vigente.
2. MIMICAL calcula el siguiente avance del trailing.
3. Si el precio pretendido ya quedó del lado inválido del mercado, se reubica a
   un tick del lado válido antes de solicitar el cambio.
4. Si NinjaTrader igualmente rechaza el cambio por movimiento del precio, se
   conserva el stop anterior y se reintenta en el siguiente tick.
5. Sólo se solicita el cierre de seguridad de la cobertura cuando el stop
   anterior dejó realmente de estar operativo.

## Alcance y pruebas

- FileVersion: `1.1.0.5`.
- AssemblyVersion y protocolo de licencia: `1.1.0.0`.
- Pruebas unitarias: reubicación válida para coberturas long y short,
  conservación del stop anterior y cierre únicamente ante pérdida de protección.
- La validación integrada debe realizarse sólo en cuentas SIM antes de publicar.
