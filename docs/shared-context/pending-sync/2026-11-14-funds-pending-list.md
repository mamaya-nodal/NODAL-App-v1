# 2026-11-14 — Lista desplegable de diferencias broker
Área: App / Contabilidad. Alcance: todos los usuarios; no se modifican registros económicos.

Decisión de Mauricio: mostrar cada pendiente por separado con fecha e importe, los nuevos arriba, y desplegar cada uno para revisar su posible transferencia. Diseño compacto, sin banners ni etiquetas extra.

Síntoma: la pantalla buscaba el primer preoperation pendiente entre las últimas 30 lecturas y mostraba un único formulario, por lo que un registro antiguo ocultaba los demás.
Cambio: consulta de pendientes separada del historial de 30 lecturas, orden descendente, formularios independientes vinculados al ID de su evento, fecha de lectura en horario argentino e importe calculado contra su referencia original. Los registros sin referencia se muestran para revisión y no usan el saldo actual como sustituto. Un fallo de consulta muestra Reintentar, sin impedir abrir la app. Se mantienen los controles contables de confirmación del servidor.

Validación: tres pruebas de importes/orden/identidad de eventos/referencia faltante; TypeScript, lint de archivos modificados y compilación de producción con webpack aprobados. Turbopack local no puede seguir el enlace de dependencias fuera del checkout; no es una falla del cambio.

Límites y continuidad: esto es la visualización acordada. NO corrige aún la supresión de nuevos eventos por un pending antiguo ni las restricciones del RPC de conciliación histórica. No afirmar que estos dos problemas quedaron solucionados. El caso Baltazar se conserva en 2026-11-14-baltazar-balance-increase-suppressed.md. No se confirmaron transferencias ni se atribuyeron los 8551 a la wallet.

Rollback: revertir el commit de interfaz; no hay migraciones ni movimientos a revertir.
Nodalito: distinguir lectura, pendiente y confirmación; conservar fecha/importe/ID de cada evidencia. No presentar cualquier diferencia como retiro o depósito confirmado.

Sincronización: pendiente. El conector Drive devolvió MCP startup failed / HTTP request failed: error decoding response body al consultar Estado e Índice. No se usó otra cuenta ni una carga manual. Restablecer la conexión para sincronizar.

Estado operativo verificado: publicado en main, revisión productiva 4bb17eb5bc4c. /api/health?database=1 respondió status ok y database ok (73 ms). Se comprobó acceso y apertura de Contabilidad en sesión de Mauricio; esa sesión no tiene pendientes, por lo que no se declara validación interactiva de confirmación ni de múltiples pendientes reales. El orden/importes se verificaron con pruebas locales. Actualización pendiente de Estado vigente e Índice en Drive: interfaz desplegada; causa de supresión de eventos y confirmación histórica siguen pendientes de implementación.
