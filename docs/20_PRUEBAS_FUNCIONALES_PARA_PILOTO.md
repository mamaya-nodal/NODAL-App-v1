# Pruebas funcionales antes del piloto

Estado: la suite automatizada cubre las reglas y el recorrido integral de
desarrollo. Esta lista organiza las comprobaciones de uso real antes de abrir
la app a alumnos.

## Recorrido del alumno

1. Crear una compra en cada empresa y confirmar que la referencia es consecutiva
   por empresa, no global.
2. Registrar el depósito inicial; verificar que establece el saldo pero no
   genera ganancia.
3. Preparar empresa, líder, réplicas no consecutivas y fase; confirmar un saldo
   y revisar que crea el Registro automáticamente.
4. Confirmar una ganancia, una pérdida y un reparto excepcional. En cada caso,
   la suma por cuenta debe coincidir con el resultado de Control Diario.
5. Corregir un saldo histórico y verificar el recálculo de los controles y
   registros posteriores.
6. Registrar `TOTAL RETIRO` manual, comprobar `TOTAL GANANCIA` y probar los
   estados Automático, Forzar viva y Forzar cerrada.
7. Revisar capital, billetera, retiro de fondeo, comisión y ambas
   conciliaciones.
8. Verificar que una alerta conduce a su origen y no cambia valores por sí sola.

## Recorrido de administración

1. Un alumno no puede abrir datos de otro alumno por URL.
2. Un administrador puede ver el resumen, la ficha y gestionar accesos.
3. Un administrador no puede modificar registros económicos desde el panel.
4. Autorizar y revocar un alumno debe conservar sus registros y dejar auditoría.

## Criterio para iniciar un piloto

Se inicia cuando los casos anteriores se completan con datos de desarrollo y
los resultados se comparan contra un mes conocido de Sheets. Sheets continúa
siendo la referencia durante el piloto.
