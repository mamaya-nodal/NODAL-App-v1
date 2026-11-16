# MIMICAL 1.1.0.10 — descarga solicitada por Mauricio

Fecha: 2026-11-16. Publicación solicitada explícitamente después de informar que la validación SIM quedó pendiente por bloqueo del control remoto. Esta publicación no constituye validación de operaciones reales.

## Cambios

Se permite la divergencia por salidas OCO no simultáneas sólo cuando las ejecuciones vinculadas reconstruyen ambas posiciones reales. Se aíslan los ciclos completos para no arrastrar entradas de operaciones anteriores cerradas manualmente. Los registros se conservan y los fills tardíos inesperados no reciben la excepción. No se modifica el disparador del trailing ni su recuperación de stops.

El segundo incidente de entradas adelantadas del broker y cancelación manual de entrada líder sigue fuera del alcance. No afirmar que todos los incidentes de David quedaron resueltos.

## Paquetes y comprobación

- Titular: private/downloads/MIMICAL-NodalBots.zip. SHA256 7C5B3C03399237570E3E5924E5F922AD3A49E3F2631579245A1AF19ACBDC60F9.
- Identidad: private/downloads/MIMICAL-NodalBots-Identity.zip. SHA256 3AB91BE06FCE00E64F0E9F2C51A45A7DB11896BEE9DCB9DCADDA3670A3C1344B.
- Ambos DLL: FileVersion/AssemblyVersion 1.1.0.10. Identidad conserva compilación MIMICAL_IDENTITY.
- Descargar requiere sesión NODAL activa y permiso Configuración, igual que antes.
- Pruebas automáticas previas: 535 controles estáticos/de lógica en el candidato titular, reproducción del registro multicíclo incluida. Paquete identidad: compilación, estructura de ZIP y 26 controles de salidas parciales aprobados.
- Validación operativa SIM: PENDIENTE. Se verificó instalación local, ventana 1.1.0.10 y configuración SIM; no se enviaron nuevas órdenes. El control remoto dejó de responder antes de iniciar la prueba.
- La app informa explícitamente el estado de validación junto a la descarga.

## Reproducción

Compilar: integrations/mimical/Compilar.ps1. Test-OrderCycles.ps1 utiliza tests/fixtures/multicycle-sim.tsv, únicamente eventos de cuentas SIM (sin credenciales). Para pruebas V1/StopLimit usar Windows PowerShell/.NET Framework. La evidencia privada del incidente de David permanece fuera del repositorio.

## Rollback y Nodalito

Revertir este cambio de publicación completo (fuentes, paquetes y MIMICAL_VERSION) restablece la 1.1.0.8; no revertir otros cambios recientes de la app. No ejecutar rollback de paquetes en medio de una operación.

Nodalito debe distinguir publicación, instalación y validación operativa; no inferir éxito SIM desde el número de versión. Al diagnosticar desincronización, separar el ciclo vigente de órdenes históricas y registrar cierres manuales. Documentar este aprendizaje no significa haber implementado una reparación automática.

## Cerebro común

Sincronización pendiente: conector Google Drive falla en handshake/discover con error decoding response body. No se actualizó Drive ni se usó otra cuenta. Restablecer conexión mamaya@nodaltrading.com para reconciliar índice/estado y registrar este despliegue.
