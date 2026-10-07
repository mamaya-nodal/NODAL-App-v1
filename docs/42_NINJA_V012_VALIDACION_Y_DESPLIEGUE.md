# Conector 0.12 candidato: validación y despliegue coordinado

Estado al iniciar el piloto autorizado (2026-10-07): migración aditiva aplicada
y registrada; servidor en preparación. Conector local todavía sin reemplazar.
La descarga oficial continúa en 0.11. Complementa APP-161 y APP-162.

## Qué cambia

- Servidor compatible con conectores anteriores; endpoint v2 separado, apagado
  salvo `NINJA_TELEMETRY_V2_ENABLED=true` y el ID del conector incluido en
  `NINJA_TELEMETRY_V2_CONNECTOR_IDS`. Sin lista se deshabilita; no acepta comodín.
  También se limita el disparador heartbeat a esa instalación.
- Cada evento obtiene un recibo asociado a instalación, ID y SHA-256 del JSON
  original. Los campos persistidos se normalizan; no se confía en IDs de dueño
  o destino enviados por el cliente. SHA-256 verifica integridad/correspondencia,
  no reemplaza autenticación ni es una firma de origen.
- `persisted` confirma almacenamiento técnico, **no contabilización**.
  `pending` conserva el evento; `excluded` se limita a simuladores según la regla
  vigente; `conflict` conserva el dato local en cuarentena y el original servidor.
- Recibo, evento técnico y trabajo de procesamiento se graban en una transacción.
  Repetir un evento confirmado no crea otro registro ni lo cambia de titular.
- Cola local cifrada con DPAPI por usuario Windows, directorio restringido a ese
  usuario y SYSTEM, escritura a archivo temporal con vaciado antes de renombrar.
  La cola antigua queda intacta y sólo se importa una vez. No se aplica el antiguo
  truncamiento de 8 MiB. Datos inválidos se conservan en cuarentena y se informan
  en la salida Ninja; nunca se envían como si fueran válidos.
- Sólo HTTPS hacia los dos dominios oficiales actuales, sin redirecciones;
  precios sin redondeo fijo a dos decimales y cadenas JSON escapadas correctamente.
- Instalador exige Ninja cerrado y actualiza la configuración con reemplazo
  atómico, conservando respaldos y vínculos. No modifica reglas contables ni UI.

## Pruebas locales reproducibles

1. `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`.
2. `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-ninja-transport.ps1`.
   Compila el helper exacto del candidato, usa DPAPI y archivos ficticios en
   `tmp/ninja-transport-<id>`. No ejecuta el instalador ni accede a la cola real.
3. Instalar PGlite sólo en `tmp/ninja-v2-validation`, sin cambiar dependencias de
   la app: `npm install --prefix tmp/ninja-v2-validation --no-save --package-lock=false @electric-sql/pglite`.
   Luego `node scripts/test-ninja-receipts.mjs`. Ejecuta la migración y funciones
   en PostgreSQL WASM aislado, cargando las definiciones reales de las tablas
   dependientes desde las migraciones del repositorio; no en Supabase real.
4. Compilación completa C# con bibliotecas locales NinjaTrader y .NET Framework
   4.8 hacia `tmp`, no hacia `NinjaTrader 8/bin/Custom`.

Comprobado: duplicados, conflictos de hash/ID, pendientes recuperables, exclusión,
aislamiento de rol authenticated, rollback, lease exclusivo y revisión llegada
durante procesamiento. Transporte: respuesta errónea/incompleta, hash/batch
incorrecto, reenvío, anexado mientras se confirma, migración, reinicio, corrupción,
cifrado DPAPI y cola superior a 8 MiB. Instalador: análisis sintáctico, no ejecución.

Resultado local del 2026-10-07: **516 pruebas / 112 archivos**, typecheck y build
correctos; lint sin errores (10 advertencias preexistentes). Harness C#: 29
comprobaciones aprobadas. Migración/RPC PostgreSQL aislado aprobados. Compilación
C# completa correcta, con advertencia CS4014 por reintento programado en segundo
plano. No se compiló ni sobrescribió el ensamblado instalado de Ninja.

## Límites que no deben presentarse como resueltos

- Falta prueba integrada con esquema completo Supabase aislado y Ninja ejecutando
  el candidato. Compilar no equivale a validar captura real ni latencia en sesión.
- El almacenamiento local es sin descarte automático, pero consume disco. Fallas
  de disco/permisos pueden impedir capturar un evento; se informa explícitamente.
  No se promete recuperar eventos nunca escritos o pérdidas de hardware.
- DPAPI/ACL no protegen frente a malware con la misma sesión o privilegios de
  administrador. No hacen invisible NODAL ante terceros.
- El procesador conserva sus reglas y ventana de lectura existentes. Un recibo
  no prueba resultado económico conciliado: datos tardíos fuera de esa ventana,
  cuentas aún sin vínculo y revisiones de negocio requieren comprobación aparte.
  No se recalculan cierres históricos ni se amplía esa ventana silenciosamente.
- Los trabajos tienen lease y reintento durable; recepción v2 y heartbeat dan
  oportunidades de procesarlos. No hay cron independiente: si deja de haber
  tráfico, los pendientes siguen guardados hasta la siguiente oportunidad.
- La observación de errores captura excepciones y respuestas HTTP fallidas de
  los motores instrumentados; no certifica que toda condición de negocio haya
  producido un asiento. No sustituye conciliación.
- No se incorporan cuotas/WAF, política de retención ni panel de cuarentena.
  Las alertas de cuarentena están en Ninja y los recibos en tablas de servicio.

## Orden de publicación (pendiente)

1. Copia de seguridad verificable; entorno de ensayo separado de producción.
   No usar Preview si comparte base con producción (APP-143).
2. Aplicar migración aditiva y servidor con v2 apagado. Comprobar compatibilidad
   0.11, permisos de servicio y aislamiento entre usuarios/identidades.
3. Habilitar v2 sólo en ensayo. Probar corte de red, respuesta perdida, cola
   antigua con pendientes, conexiones pausadas/sin dueño, reinicio y duplicados.
   Comprobar saldos y operaciones antes/después, además de recibos técnicos.
4. Sólo después de aprobar ese ensayo, publicar servidor/migración y habilitar v2.
5. Actualización piloto autorizada: cerrar Ninja, respaldar configuración, cola
   antigua y directorio `.v2`; actualizar sin reinstalar identidad ni revincular.
   Compilar/reiniciar y verificar versión, captura, recibos y conciliación.
6. Recién entonces generar el ZIP oficial 0.12, actualizar versión publicada y
   distribuir por etapas. No limpiar historiales de Mauricio, Alfred, Sebastián
   ni identidades; esta migración no necesita resets.

## Reversión

Apagar v2 detiene confirmaciones y deja la cola local intacta; no elimina tablas.
No volver sin más a 0.11: éste no lee la cola `.v2` y puede reenviar la copia vieja.
Conservar ambos formatos y respaldos; conciliar recibos pendientes antes de una
reversión del conector. Nunca borrar cuarentena, recibos ni eventos para ocultar
errores de prueba. No se aplicó ninguna reversión ni migración en vivo.
