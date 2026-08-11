# Marco de producto: SaaS privado

- Version: `0.1`
- Fecha: `2026-08-10`
- Propietario: `Producto y Tecnologia`
- Estado: `Decisiones de producto confirmadas`

## Proposito

Fijar el alcance institucional de NODAL App antes de priorizar pantallas,
elegir tecnologia o escribir codigo.

## Decisiones confirmadas

1. NODAL App sera una aplicacion web centralizada, de caracter privado, para
   alumnos y administradores autorizados de NODAL.
2. Cada usuario ingresara con su propia cuenta de Google. Google confirma su
   identidad; NODAL decide si puede acceder y que permisos tiene.
3. No existira registro publico libre. Un alumno debera ser invitado o dado de
   alta previamente por NODAL.
4. NODAL App y la futura web publica seran productos separados.
5. La web publica funcionara como espacio institucional y contendra un acceso
   hacia la aplicacion. Mientras no exista, la aplicacion podra usarse de forma
   directa.
6. La primera version no incluira cobros en linea, suscripciones publicas,
   facturacion automatica ni venta a otras organizaciones.
7. La primera prioridad es ofrecer a los alumnos un servicio igual o superior
   al de la planilla, con mayor seguridad, trazabilidad y automatizacion.
8. Google Sheets seguira siendo el sistema de referencia durante la migracion y
   no se reemplazara hasta un piloto paralelo conciliado y aprobado.

## Limites de la primera version

La primera version no debera:

- permitir que cualquier persona cree una cuenta;
- ejecutar ordenes de trading;
- guardar contrasenas o credenciales de brokers;
- depender de una integracion externa para poder funcionar;
- exponer informacion financiera de un alumno a otro;
- incluir la web publica como condicion para comenzar el piloto.

## Recorrido de acceso previsto

```text
NODAL autoriza o invita a un alumno
        ↓
El alumno ingresa con Google
        ↓
La aplicacion verifica su autorizacion y rol
        ↓
Accede solamente a su espacio Real, Practica y periodos permitidos
```

En el futuro, la web publica agregara el paso anterior:

```text
nodaltrading.com → boton “Ingresar” → app.nodaltrading.com
```

## Consecuencias para el desarrollo

Antes de construir funciones economicas con datos reales, la aplicacion debera
contar con identidad individual, autorizacion por rol, aislamiento de datos,
auditoria, backups y un mecanismo para suspender accesos.

La web publica se trabajara despues de que la aplicacion privada haya superado
su piloto inicial. Ambas compartiran identidad de marca, pero no datos privados
ni dependencias necesarias para operar.

## Pendientes que no se resuelven en este documento

- politica de retencion, exportacion y eliminacion de datos;
- roles exactos y permisos detallados;
- proceso de invitacion, suspension y baja;
- requisitos legales, privacidad y consentimiento;
- proveedor de autenticacion, hosting, base de datos y monitoreo;
- estimacion de usuarios, volumen de datos y costos;
- mecanismo de integracion con NinjaTrader y empresas prop.

## Criterio para pasar al siguiente paso

Con este marco confirmado, el siguiente paso es convertir el mapa funcional en
una lista priorizada de pantallas y definir el primer recorrido que se mostrara
en un prototipo visual, sin codigo ni datos reales.
