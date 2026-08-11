# Arquitectura tecnica de NODAL App v1

- Version: `0.1`
- Fecha: `2026-08-10`
- Estado: arquitectura inicial confirmada; implementacion aun no iniciada
- Alcance: aplicacion privada para alumnos y administradores de NODAL

## 1. Explicacion simple

NODAL App sera una aplicacion web profesional compuesta por varias piezas, pero
el alumno la vera como un unico sistema.

```text
Alumno o administrador
        |
        v
NODAL App (pantallas + servidor)
        |
        +-- verifica identidad y permisos
        +-- aplica las reglas de negocio
        +-- registra auditoria
        |
        v
Base de datos PostgreSQL
```

Codex ayudara a disenar, programar, probar y revisar el software. Los servicios
externos proporcionaran el lugar donde se ejecuta la aplicacion, se guardan los
datos y se autentican los usuarios. Las cuentas de esos servicios deberan
pertenecer a NODAL.

## 2. Decisiones tecnologicas confirmadas

| Responsabilidad | Eleccion | Motivo principal |
|---|---|---|
| Lenguaje principal | TypeScript | Un mismo lenguaje para pantalla y servidor, con deteccion temprana de errores. |
| Aplicacion web | Next.js | Permite construir interfaz y backend en un proyecto coherente y portable. |
| Forma de arquitectura | Monolito modular | Mantiene una sola aplicacion operable, separada internamente por areas de negocio. |
| Base de datos | PostgreSQL administrada con Supabase | Modelo relacional adecuado para usuarios, cuentas, periodos, operaciones y trazabilidad. |
| Identidad | Google mediante Supabase Auth | Acceso simple para el alumno sin crear una contraseña adicional. |
| Autorizacion | Reglas NODAL en servidor + politicas PostgreSQL | Google identifica; NODAL decide que puede ver y hacer cada usuario. |
| Hosting | Vercel | Despliegues de prueba y produccion separados, compatibles con Next.js. |
| Versionado | Repositorio privado GitHub | Historial revisable, pruebas automaticas y recuperacion del codigo. |
| Monitoreo | Sentry o equivalente antes del piloto | Permite detectar errores reales sin depender del reporte del alumno. |

La futura web publica sera otro proyecto. Podra compartir marca y enlazar a
`app.nodaltrading.com`, pero no contendra el backend ni los datos privados.

## 3. Que significa monolito modular

No se crearan muchos servidores pequeños desde el inicio. Existira una sola
aplicacion, dividida en modulos claros:

1. acceso, usuarios y permisos;
2. modalidades y periodos;
3. empresas, compras y cuentas;
4. Control Diario;
5. operaciones, fases, lider y replicas;
6. billetera y retiros;
7. resumen, comisiones y conciliaciones;
8. alertas, auditoria y administracion;
9. integraciones externas futuras.

Cada modulo tendra reglas propias y pruebas. Un modulo no podra modificar datos
de otro saltandose sus reglas. Si el sistema crece mucho, un modulo podra
separarse en otro servicio mas adelante sin rediseñar todo el negocio.

## 4. Distribucion de responsabilidades

### Navegador del alumno

El navegador muestra pantallas, recoge datos y presenta resultados. No decide
estados de cuenta, comisiones, permisos ni conciliaciones. Tampoco recibe
secretos administrativos.

### Servidor de NODAL App

El servidor:

- verifica la sesion y la autorizacion NODAL;
- valida todos los datos recibidos;
- ejecuta las reglas economicas y operativas;
- confirma operaciones completas dentro de transacciones;
- evita duplicados;
- genera los registros derivados;
- conserva auditoria;
- entrega solo la informacion permitida.

Las reglas de negocio seran funciones deterministas y testeables. No quedaran
escondidas dentro de botones o componentes visuales.

### PostgreSQL / Supabase

La base conserva los datos estructurados y sus relaciones. Las politicas de
seguridad por fila agregaran una segunda defensa para impedir que un alumno
consulte datos de otro. Las claves con privilegios administrativos nunca se
enviaran al navegador.

## 5. Informacion principal que conservara la base

Esta es una lista conceptual, no el diseño definitivo de tablas:

| Grupo | Informacion |
|---|---|
| Identidad | Usuario Google, autorizacion NODAL, rol, estado de acceso. |
| Espacio de trabajo | Alumno, modalidad Real o Practica y periodo mensual. |
| Catalogos | Empresas y opciones vigentes con fechas de validez. |
| Cuentas | Compra, empresa, referencia, precio, origen, estado y resultado. |
| Control Diario | Fecha operativa, movimiento, saldo, resultado, fase, lider y participantes. |
| Distribucion | Resultado total y resultado asignado a cada cuenta, con igualdad obligatoria. |
| Registro por cuenta | Entradas por fase, totales, retiros y arrastres. |
| Caja | Movimientos de billetera y retiros aprobados o cobrados. |
| Resumen | Valores calculados, conciliaciones y snapshots aprobados. |
| Auditoria | Creacion, correccion, valor anterior, valor vigente, usuario, fecha y motivo. |
| Alertas | Tipo, origen, estado, responsable y resolucion. |

Empresa y referencia formaran juntas la identidad funcional de una cuenta. Una
cuenta 1 de FFF y una cuenta 1 de LUCID seran registros distintos.

## 6. Operaciones economicas seguras

Una confirmacion importante se ejecutara como una sola transaccion. Por
ejemplo, al confirmar una operatoria de Control Diario, el sistema debera:

1. validar el saldo y calcular el resultado;
2. validar empresa, fase, lider y replicas;
3. comprobar que la suma distribuida coincide con el total;
4. guardar el Control Diario;
5. crear o actualizar las entradas de cada cuenta;
6. recalcular totales, estados, resumen y alertas;
7. registrar auditoria;
8. confirmar todos los pasos juntos.

Si uno falla, no se guarda una operacion incompleta. El reintento de la misma
confirmacion tampoco podra generar duplicados.

## 7. Correcciones

El alumno vera un historial de saldos vigentes. Si corrige uno, el nuevo valor
reemplazara al anterior en las vistas y los calculos. El sistema recalculara
automaticamente la lider y las replicas relacionadas.

La auditoria interna conservara valor anterior, valor nuevo, usuario, fecha y
motivo, sin mostrar dos operaciones vigentes ni duplicar resultados.

Una correccion individual por cuenta solo podra confirmarse si la suma final de
todas las cuentas coincide exactamente con el resultado total de Control
Diario. La app mostrara el faltante o excedente y no compensara otra cuenta de
forma silenciosa.

## 8. Seguridad por capas

La seguridad no dependera de una sola herramienta:

1. Google verifica la identidad.
2. NODAL mantiene una lista de usuarios autorizados y roles.
3. El servidor verifica permisos en cada accion.
4. PostgreSQL aplica aislamiento adicional por usuario y espacio.
5. Las acciones sensibles dejan auditoria.
6. Los secretos se guardan en variables protegidas de cada ambiente.
7. Los administradores usaran controles reforzados antes del piloto real.
8. Se aplicaran limites de solicitudes y protecciones contra abuso.

No se almacenaran contraseñas de Google, broker ni empresas prop. Tampoco se
guardaran claves, tokens o secretos dentro de GitHub.

## 9. Ambientes separados

| Ambiente | Uso | Datos permitidos |
|---|---|---|
| Local | Desarrollo en la computadora de trabajo. | Datos ficticios. |
| Preview / prueba | Revision de cada cambio antes de aprobarlo. | Datos ficticios o anonimizados. |
| Produccion | Servicio real para alumnos autorizados. | Datos reales despues de aprobar seguridad y piloto. |

Produccion tendra variables, base de datos y accesos separados. Un cambio de
codigo llegara primero a Preview; solo se promovera a Produccion tras superar
pruebas y revision.

## 10. Backups y recuperacion

Para produccion se exigira:

- backup automatico del proveedor;
- exportacion periodica independiente de la base;
- documentacion de restauracion;
- prueba real de restauracion antes del piloto;
- control de acceso a copias;
- politica de retencion aprobada.

Tener un backup no basta: la capacidad de restaurarlo debe probarse. Los
archivos adjuntos, si se agregan en el futuro, requeriran una estrategia propia
porque no forman parte automaticamente del backup de PostgreSQL.

## 11. Pruebas y publicacion

Cada cambio debera superar, segun corresponda:

- pruebas unitarias de reglas de negocio;
- pruebas de base de datos y permisos;
- pruebas del recorrido completo del alumno;
- comparacion contra casos conocidos de Sheets;
- verificacion de que no existe acceso entre alumnos;
- construccion de produccion sin errores;
- revision del cambio antes de publicarlo.

GitHub ejecutara pruebas automaticas. Vercel creara una version Preview para
revisar el cambio sin afectar Produccion.

## 12. Integraciones externas futuras

NinjaTrader y las empresas prop no formaran parte del nucleo obligatorio de la
primera version. Se conectaran mediante adaptadores separados que:

- comiencen en modo de solo lectura;
- identifiquen expresamente las cuentas autorizadas;
- no almacenen contraseñas;
- registren fuente, fecha de dato y fecha de recepcion;
- detecten duplicados y datos desactualizados;
- fallen sin impedir la carga manual de respaldo.

La aplicacion no enviara ordenes de trading en la primera version.

## 13. Servicios, propiedad y costos iniciales

| Servicio | Momento de alta | Propietario |
|---|---|---|
| GitHub | Antes de iniciar el codigo | Cuenta u organizacion de NODAL |
| Supabase | Al preparar base y autenticacion de prueba | NODAL |
| Google Cloud OAuth | Al implementar inicio de sesion | NODAL |
| Vercel | Al publicar la primera Preview | NODAL |
| Dominio/DNS | Antes del piloto privado | NODAL |
| Sentry | Antes del piloto con alumnos | NODAL |

Referencia de precios consultada el `2026-08-10`: Supabase Pro comienza en USD
25 mensuales y Vercel Pro en USD 20 mensuales. El costo inicial profesional
estimado es USD 45 a 70 mensuales mas dominio y consumos. Se revisaran precios,
limites y region antes de contratar. El desarrollo puede comenzar localmente
sin activar produccion.

## 14. Intervenciones humanas necesarias

Codex puede realizar gran parte del diseño, programacion, pruebas y
documentacion, pero antes de usar datos economicos reales se exigira:

- revision humana independiente de seguridad y permisos;
- revision de privacidad, consentimiento y tratamiento de datos;
- prueba de recuperacion de backups;
- aprobacion funcional de Contabilidad y Operaciones;
- piloto controlado y conciliado en paralelo con Sheets.

Esto no requiere contratar ahora un equipo completo. Si requiere una revision
profesional puntual antes del piloto y otra antes de Produccion.

## 15. Decisiones pendientes que no bloquean el inicio local

- estrategia de importacion del historico de Sheets;
- politica exacta de retencion, exportacion y eliminacion;
- matriz completa de permisos administrativos;
- volumen inicial y crecimiento esperado de usuarios;
- region definitiva de base de datos y hosting;
- procedimiento mensual aun pendiente de Contabilidad;
- proveedor final de monitoreo si Sentry no se adopta.

Estas decisiones deberan resolverse antes del punto del desarrollo al que
afectan. No se inventaran valores temporales que luego se conviertan
silenciosamente en reglas de produccion.

## 16. Orden de construccion aprobado

1. preparar repositorio, herramientas y pruebas;
2. crear el esqueleto local sin datos reales;
3. implementar identidad, autorizacion, modalidad y periodo;
4. implementar compras y cuentas;
5. implementar Control Diario, replicas y distribucion;
6. implementar Registro, estados y resumen basico;
7. probar el recorrido completo contra Sheets;
8. publicar Preview privada;
9. agregar billetera, retiros y conciliaciones;
10. realizar revision externa, restauracion y piloto paralelo.

No se reemplazara Sheets hasta completar y aprobar la ejecucion paralela.

## 17. Fuentes tecnicas oficiales

- Next.js, lista de produccion y TypeScript:
  `https://nextjs.org/docs/app/guides/production-checklist`
- Supabase, seguridad por filas:
  `https://supabase.com/docs/guides/database/postgres/row-level-security`
- Supabase, Google Auth:
  `https://supabase.com/docs/guides/auth/social-login/auth-google`
- Supabase, backups:
  `https://supabase.com/docs/guides/platform/backups`
- Vercel, ambientes:
  `https://vercel.com/docs/deployments/environments`
- OpenAI, capacidades de Codex:
  `https://developers.openai.com/`

## Criterio para comenzar codigo

Antes del primer archivo de aplicacion deben quedar confirmados el repositorio
privado de GitHub, la estructura local del proyecto, el administrador
responsable de las cuentas externas y los casos iniciales de prueba. Supabase y
Vercel no necesitan contratarse para crear el primer esqueleto local.
