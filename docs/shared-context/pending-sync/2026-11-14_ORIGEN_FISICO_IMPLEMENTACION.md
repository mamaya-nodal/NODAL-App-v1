# 14/11/2026 — Origen físico común de la cobertura

Área: servidor / identidades / Nodalito. Alcance: primer arreglo autorizado de la cadena Ninja–NODAL. Estado: implementado y validado localmente; publicación pendiente al redactar esta sección. No se reparan usuarios ni se lanza reproceso masivo.

Contrato: el titular opera broker y props dentro de un único Ninja, propio o de una identidad a la que accede remotamente. Identidad, propietario económico, instalación física y destino contable son dimensiones diferentes. La cobertura artificial posterior es manual; un broker sin props no se clasifica automáticamente como fallo o como cobertura real.

Causa: la ingesta conserva origen en recibos, pero las sesiones usaban solo el destino contable y el correlador buscaba candidatos entre todos los destinos del titular. La misma cuenta observada en dos PCs también podía mezclar sus secuencias antes de asociar.

Cambio: migración 20261114190000 añade origen físico a eventos de trabajo y sesiones. V2 lo estampa desde el conector autenticado dentro del receptor; v1 lo recibe del servidor autenticado, no del payload. El historial v2 puede resolver su origen desde recibos originales coincidentes, de forma acotada y sin reescribir telemetría. No se infiere origen de un destino ni se backfillean masivamente operaciones económicas.

La reconstrucción separa secuencias, inventario inicial y evidencia de PnL por instalación. La asociación de broker/props exige origen físico común antes de usar tiempo, dirección e instrumento; cuenta lógica duplicada se conserva una sola vez económicamente. Dos destinos del mismo origen siguen reuniéndose. Un origen desconocido o un grupo potencialmente parcial queda para revisión, sin completar desde otra PC. Controles ya contabilizados no se rehacen por este despliegue. Los flujos explícitos manual/sin cobertura se conservan.

Validación local inicial: 181 archivos / 850 pruebas; TypeScript; migración real en PostgreSQL aislado con estampado del origen autenticado, resolución de recibos históricos, permisos y reintentos. Nuevas regresiones: mismo origen con destinos distintos; dos conjuntos independientes; ausencia del otro broker sin contaminar el primero; origen desconocido; grupo parcialmente no verificable; broker solo; reconstrucción de dos observaciones de la misma cuenta sin mezclar PnL. Falta completar compilación y publicación/verificación productiva. No se declara una nueva operación real de punta a punta.

Rollback: aplicación anterior; retirar en la función receptora exclusivamente el set_config de origen si fuese necesario. Columnas, índice y recibos pueden conservarse; no borrar evidencia ni revertir operaciones económicas a ciegas. Si ya hay actividad nueva, cualquier reversión contable requiere auditoría específica.

Nodalito: guía actualizada para exigir origen común y distinguir ausencia de señal de ausencia de ejecuciones. Se aclaran APP-099/183 sin borrar historia. El informe de auditoría anterior conserva sus límites: este cambio no prueba cuál fue la causa histórica de Sebastian/Nico, ni recupera datos nunca recibidos.

Siguiente arreglo independiente: consumo durable autónomo de trabajos pendientes y diagnóstico de fallos, evitando reconstrucciones redundantes en cada heartbeat. Después, registro de recepción y evidencia de versión histórica. No mezclar estos pendientes con la corrección aplicada aquí.

Drive: pendiente de sincronización por fallo del conector integrado ya documentado. No se declara escritura de Estado/Índice por navegador ni sincronización completada.
