# MIMICAL 1.1.0.4 — recuperación de cambios trailing rechazados

Estado: candidato compilado y probado de forma aislada. Requiere validación
interactiva en cuentas SIM antes de sustituir la descarga publicada.

## Incidente reproducido

Fuentes aportadas por Mauricio el 9 de noviembre de 2026:

- `20261109_152042_648.tsv`;
- `20261109_153040_845.tsv`;
- captura del gráfico MNQ DEC26.

La sesión usaba MIMICAL `1.1.0.3-position-settlement`, líder
`LFE05098807990001`, cobertura `2043987`, Cross Order MNQ y ratio `-2.5`.

- 15:22:58 ART: la cobertura queda long 5 MNQ a 27907.
- 15:29:22: se solicita trailing con Después SL 0, Devuelve 2 y Paso 1.
- El SL líder y la activación quedan en 27936,50.
- 15:30:27: MIMICAL registra `TRAILING_TRIGGERED` y solicita mover el stop
  independiente desde 27869 hasta 27936.
- 15:30:28: NinjaTrader mantiene el stop anterior y rechaza la modificación con
  `UnableToChangeOrder`: un stop Sell debe quedar debajo del último negocio.
- La versión anterior ejecuta `BLOCKED`. No existe `TRAILING_EXIT_FILLED`.

La configuración del operador era válida. La causa fue una carrera normal entre
el último precio recibido por el complemento y el precio que NinjaTrader usó al
validar el cambio unos milisegundos después.

## Comportamiento corregido

`Mimical.cs`, `HandleTrailingOrder`, `RecoverTrailingOrderError`,
`AdvanceTrailing` y `RequestTrailingFallbackExit`:

1. Un rechazo de modificación ya no llama a `Trip`.
2. Si el stop anterior sigue activo, MIMICAL adopta nuevamente su precio real,
   limpia el cambio fallido y conserva la cobertura protegida.
3. Con el siguiente precio vuelve a calcular y reintenta el avance.
4. Si el precio ya tocó el stop pretendido, no persigue el mercado con stops
   inválidos: usa `Account.Flatten` sólo para la cuenta e instrumento de
   cobertura.
5. La cancelación del stop causada por ese cierre se reconoce como parte del
   proceso y no bloquea el motor.
6. Si `Account.Flatten` no puede enviarse, queda registrado y se vuelve a
   intentar ante el siguiente precio.
7. Si falla la creación inicial de la protección independiente, se conservan
   el TP y SL normales porque todavía no habían sido retirados; sólo se desactiva
   el trailing.

La referencia oficial de NinjaTrader define `Account.Flatten` sobre una colección
de instrumentos como la cancelación de las órdenes y el cierre de las posiciones
de esos instrumentos en esa cuenta. La implementación entrega una colección con
un único elemento: el instrumento de la cobertura.

No cambian ratios, Cross Order, activación respecto del SL líder, Devuelve, Paso,
licenciamiento ni conciliación de posiciones.

## Validación aislada

- Compilación personal e identidad con FileVersion 1.1.0.4.
- 60 controles generales, incluidos los bordes long/short del stop pretendido,
  conservación del stop anterior y cierre seguro de cobertura.
- 48 controles de conciliación de posiciones.
- 31 controles de recuperación de entrada inversa.
- 9 controles de licencia.
- Se deben ejecutar además Stop Limit, evidencia cruzada y estructura de ambos
  paquetes antes de entregar el ZIP.

Estas pruebas no conectan cuentas ni envían órdenes. La prueba SIM pendiente debe
reproducir una activación con Devuelve 2 y confirmar en el TSV que ocurre una de
estas secuencias:

- `TRAILING_MOVE` aceptado y luego `TRAILING_EXIT_FILLED`; o
- `TRAILING_MOVE_RETRY_PENDING`, seguido de un nuevo avance válido; o
- `TRAILING_EXIT_FALLBACK_REQUESTED` y `TRAILING_EXIT_FALLBACK_SUBMITTED`, con
  la cobertura finalmente Flat.

En ninguna secuencia debe aparecer `BLOCKED` por el rechazo del cambio trailing.

## Recuperación

Checkpoint previo: `outputs/20261109_trailing_recovery_prechange/`.
Para volver a 1.1.0.3, finalizar el ciclo, comprobar todas las cuentas Flat y sin
órdenes activas, reimportar el ZIP anterior y reiniciar NinjaTrader. Los archivos
de licencia y configuración no forman parte del rollback.
