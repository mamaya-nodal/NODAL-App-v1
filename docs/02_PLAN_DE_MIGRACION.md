# Plan de migracion a NODAL App

## Principio

La migracion sera paralela. Google Sheets continuara operativo hasta que la
aplicacion alcance equivalencia funcional, seguridad suficiente y resultados
conciliados durante un piloto real.

## Etapa 0: estabilizar y especificar

- terminar los pendientes criticos del sistema actual;
- formalizar el ciclo mensual;
- identificar reglas y fuentes propietarias;
- convertir incidentes conocidos en casos de regresion;
- definir conjuntos de datos de prueba anonimizados.

Criterio de salida: reglas principales documentadas y resultados esperados
reproducibles.

## Etapa 1: fundacion tecnica

- crear repositorio privado en GitHub;
- definir arquitectura y modelo de datos;
- configurar TypeScript, pruebas, calidad y despliegues de prueba;
- implementar autenticacion con Google y roles;
- establecer ambientes de desarrollo, prueba y produccion;
- configurar secretos, backups y registros de auditoria.

Criterio de salida: un usuario puede autenticarse y acceder solo a un ambiente
sin datos productivos.

## Etapa 2: recorrido vertical

Implementar un flujo completo y pequeno:

1. comprar una cuenta;
2. registrar control diario;
3. guardar una operacion;
4. actualizar estado y resultado;
5. reflejarlo en un resumen individual.

Criterio de salida: el flujo produce los mismos resultados que los casos de
referencia de Sheets.

## Etapa 3: equivalencia mensual

- replicas y grupos de cuentas;
- retiros pendientes y cobrados;
- billetera y movimientos externos;
- conciliaciones;
- comisiones de mesa y ganancia del trader;
- cierre y apertura mensual;
- panel administrativo.

Criterio de salida: un mes completo puede reconstruirse y conciliarse.

## Etapa 4: piloto paralelo

- seleccionar administradores y un grupo pequeno de traders;
- registrar el mismo periodo en ambos sistemas;
- comparar resultados automaticamente;
- clasificar diferencias entre carga, regla e implementacion;
- corregir sin alterar los historicos.

Criterio de salida: periodo piloto conciliado y aprobado por las areas
propietarias.

## Etapa 5: adopcion gradual

- migrar usuarios por grupos;
- conservar planillas cerradas como historico de solo lectura;
- mantener rollback durante el periodo acordado;
- medir incidencias, tiempos de carga y conciliaciones;
- retirar escrituras en Sheets solo despues de aprobacion.

## Condiciones de no avance

No avanzar a produccion si existen diferencias contables sin explicar,
permisos no probados, ausencia de backups, migraciones irreversibles, secretos
en el repositorio o reglas funcionales sin propietario.

