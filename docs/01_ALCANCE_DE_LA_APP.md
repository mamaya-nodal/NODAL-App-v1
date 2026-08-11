# Alcance de NODAL App

## Proposito

Crear una aplicacion web centralizada que reproduzca y luego mejore el sistema
mensual de registro, control, conciliacion y administracion actualmente
implementado con Google Sheets y Apps Script.

## Objetivos del producto

- ofrecer a cada trader un acceso individual;
- centralizar datos, reglas y actualizaciones;
- evitar copias independientes de formulas y scripts;
- aplicar permisos por rol;
- conservar trazabilidad y auditoria;
- facilitar pruebas, revisiones y despliegues controlados;
- permitir evolucion futura hacia integraciones con broker y herramientas de IA.

Estos son objetivos del producto y de Tecnologia. No reemplazan los objetivos
empresariales definidos por NODAL Core.

## Capacidades que debera contemplar

### Trader

- registrar compras de cuentas;
- registrar control diario, depositos, retiros, saldos, lider y fase;
- cargar y consultar operaciones por cuenta;
- replicar registros entre cuentas;
- consultar estados, resultados, retiros y resumen operativo;
- visualizar alertas y correcciones requeridas;
- separar practica de operacion real y periodos mensuales.

### Administracion

- gestionar usuarios, roles, periodos y niveles;
- consultar planillas o registros equivalentes de cada participante;
- visualizar actividad, resultados, comisiones, alertas y auditorias;
- ejecutar cierres y aperturas mensuales;
- administrar backups, recuperaciones y correcciones auditadas;
- publicar versiones sin alterar datos historicos.

### Sistema

- autenticacion con Google;
- autorizacion por rol y pertenencia;
- base de datos central;
- reglas contables deterministas en el servidor;
- historial de cambios;
- pruebas automatizadas;
- exportacion y conservacion del historico;
- monitoreo y recuperacion.

## Fuera del alcance inicial

- reemplazar inmediatamente las planillas en produccion;
- automatizar rutas todavia no documentadas;
- conectar NinjaTrader o brokers en la primera version;
- incorporar IA para decidir calculos o cierres;
- almacenar credenciales de trading;
- desarrollar aplicacion movil nativa.

## Regla de equivalencia

Una funcionalidad migrada se considera equivalente cuando, usando los mismos
datos de entrada, produce el mismo resultado esperado que la regla vigente,
supera sus pruebas y conserva trazabilidad. Una diferencia debe investigarse y
ser aprobada antes de convertirse en una nueva regla.

