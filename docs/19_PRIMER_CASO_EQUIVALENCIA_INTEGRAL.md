# Primer caso de equivalencia integral

- Fecha: `2026-08-14`
- Estado: caso automatizado con reglas confirmadas
- Datos reales: ninguno
- Efecto en la base de desarrollo: reversible mediante `BEGIN` y `ROLLBACK`

## Propósito

Comprobar que los módulos ya implementados producen un resultado coherente de
punta a punta, sin probar cada pantalla como una pieza aislada.

Este caso usa reglas recuperadas y confirmadas desde Sheets, pero no reemplaza
la comparación posterior contra un período real anonimizado. Esa conciliación
seguirá requiriendo un caso aportado y aprobado por las áreas propietarias.

## Escenario confirmado

1. Se compran ocho cuentas de LUCID a USD 89 cada una con origen
   `Aporte trader`.
2. Las referencias son correlativas dentro de LUCID.
3. Un depósito inicial de USD 5.000 establece el saldo de referencia y no
   genera resultado operativo.
4. Un nuevo saldo broker de USD 5.500 genera un resultado total de USD 500.
5. La cuenta 1 es líder y se seleccionan expresamente las cuentas 4, 7 y 8 como
   réplicas.
6. Las cuentas 2, 3, 5 y 6 no participan, aunque estén entre las referencias
   seleccionadas.
7. El resultado se divide en cuatro importes exactos de USD 125.

## Resultados exigidos

| Área | Resultado esperado |
|---|---|
| Compras | 8 cuentas LUCID, USD 712 de costo total y estado virgen. |
| Control Diario | Depósito USD 5.000 sin resultado; saldo USD 5.500 con resultado +USD 500. |
| Participantes | Líder 1; réplicas 4, 7 y 8; ninguna cuenta intermedia inferida. |
| Registro | 4 entradas `NETO BROKER +` de USD 125. |
| Resumen inicial | Saldo USD 5.500; depósito USD 5.000; resultado operativo USD 500; 8 cuentas; 4 entradas. |
| Estados | Las 8 cuentas permanecen vírgenes porque todavía no se calcula `TOTAL GANANCIA`. |
| Actividad | 8 compras y 2 controles reconstruibles en orden temporal. |

## Cobertura automática

La prueba TypeScript compone los servicios deterministas de Compras, Control
Diario, distribución, Registro y Resumen. La prueba PostgreSQL ejecuta las
transacciones reales, revisa participantes, entradas y Actividad, y luego
revierte todos los datos.

## Qué queda pendiente

- repetir este recorrido con un caso real anonimizado de Sheets;
- comparar los resultados celda/regla contra la fuente de referencia;
- obtener aprobación funcional de cualquier diferencia encontrada;
- incorporar `TOTAL GANANCIA` y estados derivados solamente cuando sus entradas
  completas estén validadas;
- no habilitar todavía datos reales ni reemplazar el sistema vigente.

