# Mapa de migración: cierres, conciliaciones y permisos

Estado: relevamiento para validación.  
Este documento organiza controles que la aplicación deberá preservar. No define
un nuevo cierre, no modifica fórmulas ni cambia permisos del sistema actual.

## 1. Propósito

La aplicación debe poder mostrar al alumno el avance de su capital y, al mismo
tiempo, permitir a NODAL detectar diferencias antes de que se conviertan en un
error histórico. Para eso se necesitan tres piezas conectadas:

1. conciliaciones explicables;
2. cortes semanales y mensuales trazables;
3. permisos separados por responsabilidad.

## 2. Hechos vigentes confirmados

### Conciliaciones

El modelo actual distingue capital, flujo de caja y resultado. Un depósito, un
retiro o el traslado entre ubicaciones no es ganancia por sí mismo.

Existen dos controles principales:

| Control | Comparación vigente | Resultado esperado |
|---|---|---|
| Conciliación de capital | Posición observable contra posición esperada según capital aportado y resultado acumulado. | Diferencia cero. |
| Conciliación de ganancias | Ganancia realizada de cuentas cerradas contra resultado del período + flotante de cuentas vivas + precio de cuentas vírgenes. | Diferencia cero. |

Una diferencia no autoriza a alterar cifras ni a ocultar datos. Es una alerta
que debe permitir investigar los registros que la originaron.

### Corte semanal y mensual

El Resumen Operativo actual contempla resultados y posición por semana: compras,
resultado broker, retiros aprobados, posición de cierre y flotante que se
arrastra. Además, el resultado histórico se traslada entre meses mediante un
procedimiento de cierre controlado.

El sistema actual identifica la falta de un ciclo mensual formal como riesgo
pendiente. Por lo tanto, la app no puede inventar ni automatizar todavía una
política nueva de cierre mensual.

### Comisión

La base vigente es la ganancia realizada de cuentas cerradas. La comisión es
estimada durante el período, se muestra con su tramo aplicado y no aplica a
administradores. La regla exacta y sus tramos ya están documentados en
`docs/10_MAPA_DE_MIGRACION_RESUMEN_Y_CONCILIACIONES.md`; este documento no la
modifica.

### Acceso

Está confirmado que el acceso será mediante identidad de Google y autorización
previa de NODAL. No habrá registro público libre. También está confirmado que
la autenticación y la autorización se separan: iniciar sesión no concede, por
sí solo, acceso a datos ni acciones.

## 3. Comportamiento objetivo de la app (propuesta alineada)

### Conciliaciones visibles y explicables

Cada conciliación mostrará:

- valor observable;
- valor esperado;
- diferencia;
- fecha de cálculo;
- registros que integran ambos valores;
- estado de revisión y responsable, cuando exista una revisión.

La aplicación recalculará los controles al cambiar una fuente relacionada,
pero nunca efectuará un ajuste automático para forzar diferencia cero.

### Cortes como snapshots, no como borrado

Al validarse el procedimiento de negocio, cada cierre semanal o mensual deberá
conservar una fotografía inalterable de los valores calculados y de los
registros que la componen. Las correcciones posteriores se registrarán como
correcciones trazables; no reescribirán silenciosamente el pasado.

Mientras el procedimiento mensual no esté validado, la app podrá mostrar el
período y alertas de revisión, pero no marcarlo como cerrado de forma
automática.

### Roles mínimos a diseñar

La siguiente tabla es una propuesta técnica inicial, no una asignación de
permisos aprobada:

| Acción | Alumno | Administrador NODAL | Responsable de control (pendiente) |
|---|---|---|---|
| Ver y cargar datos propios | Sí, dentro de su alcance | Sí | A definir |
| Ver datos de otros alumnos | No | Según autorización | A definir |
| Corregir registros con impacto económico | Solicitud o flujo a definir | Según autorización | A definir |
| Registrar o confirmar retiro | A definir | Según autorización | A definir |
| Revisar/validar conciliaciones | Ve sus diferencias y detalle permitido | Sí | A definir |
| Cerrar semana o mes | No por defecto | A definir | A definir |

No se implementará ningún permiso de esta tabla como hecho hasta que NODAL
confirme responsables y alcance. Sí se preservará desde el diseño la capacidad
de aplicar permisos en el servidor y dejar auditoría de cada acción sensible.

## 4. Alertas que deberán conservarse

- diferencia de conciliación de capital o de ganancias;
- saldo de broker desactualizado;
- retiro aprobado aún no cobrado;
- actividad incompleta de una cuenta;
- corrección posterior que afecte un valor ya mostrado;
- semana o período pendiente de revisión.

Una alerta debe indicar el motivo, fecha, estado, responsable cuando exista y
un enlace al origen. No debe limitarse a un semáforo sin explicación.

## 5. Información pendiente de validar

1. Fórmulas completas de posición esperada y observable, incluidos los datos
   que entran y salen en cada cierre.
2. Quién puede iniciar, revisar y aprobar un cierre semanal y mensual.
3. Si un cierre admite reapertura, bajo qué motivo y con qué trazabilidad.
4. Tratamiento del resultado histórico y del arrastre entre meses.
5. Campos y estados formales de una revisión de conciliación.
6. Matriz final de permisos por rol, incluido qué detalle económico puede ver
   cada perfil.
7. Casos de regresión reales anonimizados: conciliación correcta, diferencia,
   corrección posterior y cambio de período.

## 6. Pruebas de equivalencia necesarias

1. Reproducir una semana conocida y comparar cada bloque del Resumen contra la
   planilla.
2. Reproducir un período con cuentas vírgenes, vivas y cerradas, y verificar la
   conciliación de ganancias.
3. Introducir una diferencia controlada y verificar que la app la explica sin
   ajustarla automáticamente.
4. Verificar que un retiro aprobado no cobrado y uno cobrado afectan las vistas
   correctas.
5. Verificar que una corrección posterior conserva quién la hizo, cuándo y qué
   valor reemplazó.
6. Confirmar que un alumno no puede consultar ni modificar datos de otro, ni
   ejecutar acciones reservadas.

## 7. Criterio de cierre

Este mapa estará completo cuando Contabilidad defina el ciclo de cierre y
NODAL apruebe la matriz de roles. Solo entonces se podrá convertir estas reglas
en servicios de backend y pruebas automatizadas.
