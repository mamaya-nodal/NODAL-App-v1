# Estado inicial del desarrollo

- Fecha: `2026-08-10`
- Estado: base local creada y verificada
- Datos reales: ninguno
- Servicios externos conectados: ninguno

## Resultado de esta etapa

NODAL App ya posee un esqueleto tecnico ejecutable. Todavia no es una version
funcional para alumnos: es la base sobre la cual se construiran los modulos sin
mezclar reglas de negocio, interfaz y conexiones externas.

## Herramientas instaladas

| Herramienta | Version inicial bloqueada en `package-lock.json` | Uso |
|---|---:|---|
| Next.js | 16.3.0 | Aplicacion web y servidor. |
| React | 19.2.8 | Interfaz. |
| TypeScript | 6.0.3 | Lenguaje y verificacion de tipos. |
| ESLint | 9.39.5 | Control de calidad del codigo. |
| Vitest | 4.1.10 | Pruebas automaticas. |

TypeScript 7 y ESLint 10 no se utilizaron porque las herramientas actuales de
Next.js presentaron incompatibilidades. Se fijaron versiones compatibles y
reproducibles, sin vulnerabilidades reportadas por la instalacion.

## Estructura creada

```text
src/
  app/                         Pantalla y estilos iniciales
  modules/
    control-diario/
      domain/                  Reglas sin interfaz ni base de datos
docs/                          Conocimiento y decisiones del proyecto
```

El primer archivo de negocio valida reglas ya confirmadas:

1. la suma distribuida entre lider y replicas debe coincidir con el resultado
   total de Control Diario;
2. una perdida economica se convierte en magnitud positiva para
   `NETO BROKER -`;
3. una ganancia se dirige a `NETO BROKER +`.

Los importes de estas reglas se representan internamente en centavos enteros
para evitar errores de redondeo del lenguaje.

## Verificaciones realizadas

| Verificacion | Resultado |
|---|---|
| Pruebas de negocio | 5 de 5 aprobadas. |
| TypeScript estricto | Aprobado. |
| ESLint | Aprobado. |
| Compilacion de produccion | Aprobada con Next.js 16.3.0. |
| Auditoria de dependencias durante instalacion | 0 vulnerabilidades reportadas. |

## Lo que deliberadamente no se hizo

- no se conecto Supabase;
- no se creo autenticacion Google;
- no se publico en Vercel;
- no se creo ni conecto un repositorio remoto de GitHub;
- no se copiaron datos de alumnos ni de la Plantilla Maestra;
- no se modifico Sheets, Apps Script ni Panel Central;
- no se implemento aun un formulario operativo.

## Siguiente etapa tecnica

La siguiente etapa debe preparar la persistencia sin usar datos reales:

1. definir el modelo inicial de usuarios, modalidades, periodos, empresas,
   cuentas y compras;
2. escribir sus reglas y pruebas antes de conectar una base remota;
3. preparar migraciones PostgreSQL revisables;
4. crear el repositorio privado de GitHub bajo propiedad de NODAL;
5. conectar Supabase de desarrollo solamente cuando el modelo local este
   revisado.

Antes de crear cuentas externas se indicara al responsable de NODAL que debe
hacer, que acceso conservar y que costo puede generar.
