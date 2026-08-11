# NODAL App v1

Proyecto paralelo para disenar y construir la futura aplicacion web de NODAL.

La aplicacion no reemplaza todavia la Plantilla Maestra. Durante la migracion,
el sistema de Google Sheets es la referencia funcional contra la que se deben
comparar reglas, calculos y flujos.

## Fuentes de conocimiento

- Direccion y reglas transversales: `../NODAL-Core-v1/`.
- Contabilidad, gestion y sistema actual: `../NODAL-Contabilidad-Gestion-v1/`.
- Operaciones, fases y replicas: `../NODAL-Operaciones-v1/`.
- Alcance y decisiones de la aplicacion: `docs/`.

No se duplica la documentacion canonica de las areas. `AGENTS.md` define el
orden de lectura y los limites de responsabilidad.

## Estado

- Aplicacion web: base tecnica en desarrollo, todavia no habilitada para alumnos.
- Planilla actual: sistema de referencia y produccion.
- Migracion: paralela, gradual y sin interrupcion del sistema actual.
- Repositorio remoto: privado en `mamaya-nodal/NODAL-App-v1`.
- Base de datos: migracion inicial preparada; proyecto Supabase aun no vinculado.

## Primer inicio en Codex

Abre un nuevo hilo con `NODAL-App-v1` como carpeta de trabajo y escribe:

```text
Lee AGENTS.md y todas las fuentes obligatorias que indica. Este hilo se dedica
exclusivamente a NODAL App. No modifiques el sistema de Google Sheets. Confirma
tu comprension del negocio, del sistema actual, de las decisiones vigentes y de
los pendientes antes de proponer arquitectura.
```

## Documentos propios

- `docs/00_HANDOFF_DESDE_SHEETS.md`: punto de partida y novedades posteriores
  al ultimo corte documental del sistema actual.
- `docs/01_ALCANCE_DE_LA_APP.md`: responsabilidades y limites.
- `docs/02_PLAN_DE_MIGRACION.md`: etapas y criterios de avance.
- `docs/03_DECISIONES_TECNICAS.md`: decisiones confirmadas y abiertas.
- `docs/04_MAPA_FUNCIONAL_DE_LA_APP.md`: mapa funcional inicial.
- `docs/05_MARCO_SAAS_PRIVADO.md`: alcance confirmado como SaaS privado.
- `docs/06_PRIORIZACION_DE_PANTALLAS.md`: orden de diseno e implementacion de
  las pantallas.
- `docs/07_MATRIZ_DE_CARGA_AGIL.md`: que datos carga el alumno y cuales debe
  completar o calcular el sistema.
- `docs/08_MAPA_DE_MIGRACION_CONTROL_DIARIO.md`: logica vigente y migracion
  aprobada de Control Diario hacia registros automaticos por cuenta.
- `docs/09_MAPA_DE_MIGRACION_REGISTRO_OPERACIONES.md`: migracion del registro
  por cuenta, fases, arrastre, estados y replicas.
- `docs/10_MAPA_DE_MIGRACION_RESUMEN_Y_CONCILIACIONES.md`: migracion del
  resumen, progreso de capital, conciliaciones, comision y cortes semanales.
- `docs/11_MAPA_DE_MIGRACION_COMPRAS_BILLETERA_Y_RETIROS.md`: migracion de
  compras, movimientos de billetera, cobros pendientes y retiros cobrados.
- `docs/12_MAPA_DE_CIERRES_CONCILIACIONES_Y_PERMISOS.md`: controles de
  conciliacion, cierres pendientes de validar y separacion de permisos.
- `docs/13_MATRIZ_DE_EQUIVALENCIA_SHEETS_A_APP.md`: relacion entre cada
  funcion de Sheets, su equivalente futuro en la app y su prueba de aceptacion.
- `docs/14_INVESTIGACION_PERDIDAS_CORRECCIONES_Y_REPLICAS.md`: evidencia del
  tratamiento de perdidas y limites del guardado y la replica actuales.
- `docs/15_ARQUITECTURA_TECNICA_V1.md`: estructura profesional confirmada,
  seguridad, servicios, ambientes, costos y orden de construccion.
- `docs/16_ESTADO_INICIAL_DEL_DESARROLLO.md`: herramientas instaladas,
  verificaciones aprobadas y limites de la primera base local.
- `docs/17_MODELO_INICIAL_DATOS_Y_ACCESO.md`: tablas iniciales, aislamiento,
  reglas de compra confirmadas y pendientes antes de conectar Supabase.

