# 17/11/2026 — Auditoría causal: Flat faltante, indicador activo y mensaje incorrecto

## Alcance y restricciones
Mauricio pidió investigar y corregir de forma general el incidente de su Lucid terminada en 069, incluyendo el indicador que siguió mostrando la operación activa. Temporalmente autorizó usar el navegador integrado y retiró permiso para controlar aplicaciones/ventanas de su PC. No volver a usar control nativo mientras siga esa restricción. Los otros tres casos históricos y la modificación NQ/MNQ continúan suspendidos.

## Hechos confirmados
- Registro de Ninja previamente leído: `trace.20261117.00000.txt:13262`, 17/11 a las 15:26:37.639 de Buenos Aires, `Cbi.Account.PositionUpdateCallback`, NQ DEC26, 069, cantidad0, Flat, OperationRemove. Ninja sí procesó el cierre.
- Consulta en Supabase mediante navegador: el recibo de posición de069 del incidente contiene solamente Long2, eventId0202f5eab40447498d1b863665721603, persisted/stored. No hay recibo Flat de esa cuenta en ninguno de los orígenes de Mauricio revisados. No apareció como pending, excluded ni conflict. Los otros cuatro Flat prop y el broker de la misma cobertura sí tienen recibos persisted/stored.
- Llegaron entrada/salida y balance final de069. Regresión sobre originales acredita cierre completo y resultado1503USD. No fabricar ni insertar posiciónFlat original.
- Verificación independiente final: lote5c9da652-f3a0-4804-918a-4af66afa17b3 committed; controlb814c406-306a-4a34-b685-b11d882f02a0; resultado broker-41540c;5cargas; sesión069closed;0recibos pendientes/conflict en intervalo del trade.

## Qué se puede concluir y qué no
El faltante está antes del registro durable de ese evento en el servidor. No hay evidencia de que el conciliador rechazara el Flat ni de que se enviara a otra identidad revisada. Con los registros disponibles no se distingue de forma concluyente entre callback no capturado, descarte previo a persistir localmente o envío que nunca alcanzó la recepción durable. La cola actual vacía no demuestra por sí sola qué ocurrió con un callback anterior. No atribuir este incidente a red, deduplicación, null en PositionEventArgs o error de disco sin prueba. La captura local v18 no ofrece bitácora durable por cada decisión de callback que permita cerrar esa atribución retrospectiva.

## Bugs confirmados de la app y correcciones generales
1. Reconstrucción demasiado dependiente de Flat: el servidor ahora reconoce cierre derivado solamente con entrada/salida completas, precios/cantidades válidos, un instrumento y dirección, sin posición posterior, balance estabilizado cash=net/unrealized0 y quietud10s. Publicadoa4903ff6354a. Reproceso normal real completó50537/50537 y concilió las cinco cuentas sin editar telemetría ni crear cargas manuales.
2. Indicador de operación activa construido solo con posición cruda antigua: ahora usa también el último cierre estabilizado del servidor para ese instrumento/intervalo. Preserva posiciones/ejecuciones posteriores, otros instrumentos y nuevas sesiones abiertas. Publicado0d47e697e272. Regresión con datos originales: openPositions1→0/statusopen→ready. El cierre de posición no significa quema/cierre de la cuenta prop.
3. Mensaje de falta de registro cuando una prop estaba esperando cierre: el contexto incluía5props pero solo4cerradas participaban; la diferencia se interpretaba como registrofaltante. Corrección puntual agrega members_unsettled y el motivo 'Falta confirmar el cierre de1cuenta prop'. No cambia asignaciones ni permite cobertura parcial; conserva prioridad de ambigüedad. En preparación para publicación al crear este registro.

## Validación y riesgos
46tests de proyección/asociación/indicador/cierre aprobados y TypeScript aprobado para el tercer cambio; los dos anteriores tienen además compilación y verificaciones productivas documentadas en2026-11-17_MAURICIO_AVISO_FLAT_FALTANTE.md. Completar estado de publicación después de verificar health. Datos de auditoría: outputs/flat-receipt-cause-audit-20261117.json. No se certificó visualmente la sesión personal del usuario porque el navegador auxiliar solicitaba login; sí se ejecutó la misma función del indicador con sus datos reales.

No se modificó, instaló ni publicó otro conector por una causa todavía no demostrada. Las correcciones del servidor/interfaz evitan que este faltante aislado bloquee o muestre actividad indefinida cuando existe prueba completa del cierre. No cubren ejecuciones faltantes o cantidades ambiguas. Rollback de código por commit; no eliminar una conciliación válida al revertir código. Se conservaron fuentes y trazabilidad.

## Nodalito y continuidad
Distinguir transporte/captura, reconstrucción, conciliación y presentación. No pedir nueva compra por un cierre técnico pendiente. Si Ninja confirmaFlat pero no hay recibo, informar frontera de pérdida comprobada y límite de atribución; no inventar una causa. Para un próximo diagnóstico exacto del cliente se necesita trazabilidad de captura/descartes/guardado por evento, de forma acotada y sin credenciales, antes de exigir otra actualización general. No declarar que Nodalito aprendió automáticamente; se actualiza su FAQ/corpus versionado.

Drive integrado sigue fallando con MCPstartup/handshake HTTP decodingresponsebody. Registro local pendiente de sincronización; no se usó navegador ni otra cuenta para editar Drive.
