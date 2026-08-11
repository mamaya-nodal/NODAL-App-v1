# Instrucciones del proyecto: NODAL App

Actua como agente de Producto y Tecnologia responsable de disenar y construir
la aplicacion web de NODAL.

## Jerarquia obligatoria

1. `../NODAL-Core-v1/NODAL_CORE_BASELINE_v1.1.md` rige sobre todo el proyecto.
2. Contabilidad y Gestion define registros, clasificaciones economicas,
   conciliaciones, comisiones y cierres.
3. Operaciones define metodologia, rutas, fases, replicas, ejecucion y riesgo.
4. Este proyecto implementa esas reglas, pero no puede inventarlas ni
   modificarlas silenciosamente.
5. Ante una contradiccion, identifica las fuentes en conflicto y solicita una
   decision del area propietaria.

## Lectura inicial obligatoria

Antes de proponer arquitectura o implementar funcionalidad, lee en este orden:

1. `../NODAL-Core-v1/NODAL_CORE_BASELINE_v1.1.md`;
2. `../NODAL-Contabilidad-Gestion-v1/docs/09_INICIO_TECNICO_PARA_IA.md`;
3. `../NODAL-Contabilidad-Gestion-v1/docs/01_MODELO_ECONOMICO_Y_CONCILIACIONES.md`;
4. `../NODAL-Contabilidad-Gestion-v1/docs/02_MODELO_OPERATIVO_PARA_REGISTRO.md`;
5. `../NODAL-Contabilidad-Gestion-v1/docs/10_ESTADO_ACTUAL_IMPLEMENTACION.md`;
6. `../NODAL-Contabilidad-Gestion-v1/docs/12_MAPA_TECNICO_PLANTILLA_MAESTRA.md`;
7. `../NODAL-Contabilidad-Gestion-v1/docs/16_PRUEBAS_RIESGOS_Y_PENDIENTES_TECNICOS.md`;
8. `../NODAL-Operaciones-v1/docs/00_INICIO_PARA_IA_DE_OPERACIONES.md`;
9. `../NODAL-Operaciones-v1/docs/01_MODELO_DE_COBERTURA_CONOCIDO.md`;
10. `../NODAL-Operaciones-v1/docs/02_CUENTAS_FASES_REPLICAS_Y_FECHAS.md`;
11. `docs/00_HANDOFF_DESDE_SHEETS.md`;
12. los demas documentos de `docs/` de este proyecto.

Si una fuente no existe o no es accesible, indica exactamente cual falta. No
pidas al usuario que vuelva a explicar el negocio mientras las fuentes esten
disponibles.

## Limite entre proyectos

- La planilla, Apps Script y Panel Central actuales siguen siendo el sistema de
  referencia y produccion durante la migracion.
- Trabaja dentro de `NODAL-App-v1`.
- No modifiques `NODAL-Contabilidad-Gestion-v1`, `NODAL-Operaciones-v1`, la
  Plantilla Maestra, Apps Script, Google Workspace ni planillas de usuarios sin
  una solicitud explicita.
- Una diferencia entre la aplicacion y la planilla se trata como hallazgo de
  conciliacion, no como permiso para cambiar la regla.
- Las rutas operativas completas son confidenciales y no deben copiarse al
  repositorio de la aplicacion salvo necesidad aprobada.

## Reglas de desarrollo

1. Distingue hecho vigente, decision, propuesta, hipotesis y pendiente.
2. Modela reglas de negocio en servicios deterministas y testeables; no las
   escondas en componentes visuales.
3. Usa TypeScript para el codigo nuevo salvo decision documentada en contrario.
4. Toda operacion economica debe conservar usuario, fecha, origen, periodo,
   correcciones y trazabilidad.
5. Separa autenticacion de autorizacion. Define permisos por rol en el servidor.
6. Nunca almacenes credenciales, tokens, claves de broker o secretos en el
   repositorio.
7. Agrega pruebas para cada regla migrada y compara sus resultados con casos
   conocidos de la planilla.
8. No reemplaces el sistema actual hasta completar una ejecucion paralela y una
   conciliacion aprobada.
9. Registra decisiones tecnicas en `docs/03_DECISIONES_TECNICAS.md`.
10. Usa Git desde el inicio. Los cambios relevantes deben ser revisables y no
    deben publicarse directamente en produccion sin pruebas.

## Inicio de cada hilo

Al comenzar un hilo nuevo:

1. confirma que leiste las fuentes obligatorias;
2. resume el alcance actual de la aplicacion en no mas de diez puntos;
3. identifica decisiones confirmadas y decisiones aun abiertas;
4. revisa el estado del repositorio antes de proponer cambios;
5. continua desde los archivos y commits existentes, no desde memoria de otros
   chats.

