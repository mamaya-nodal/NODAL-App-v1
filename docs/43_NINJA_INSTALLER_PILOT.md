# Piloto del instalador ejecutable del conector Ninja

## Alcance autorizado

El primer ejecutable es privado y sirve solamente para actualizar una instalación
NODAL ya vinculada a la versión 0.16. No se publica en la aplicación ni reemplaza
todavía la descarga general. Mauricio lo valida primero en su propia instalación.

## Comportamiento

- exige que NinjaTrader esté cerrado;
- detecta `Documentos\NinjaTrader 8` y una sesión NODAL vigente;
- conserva identificador, credenciales protegidas, destinos, historial y cola;
- migra el dominio anterior de compatibilidad a `https://app.nodaltrading.com`;
- instala un ensamblado compilado independiente, por lo que no exige abrir el
  editor NinjaScript ni pulsar F5;
- deshabilita el runtime fuente anterior sin borrarlo;
- guarda copia de los archivos anteriores en
  `Documentos\NinjaTrader 8\NODAL\installer-backups`;
- revierte automáticamente los archivos tocados si la instalación no termina;
- opcionalmente abre NinjaTrader al finalizar.

El runtime piloto utiliza un archivo de configuración separado para que el código
fuente anterior no transmita en paralelo. Ambos pertenecen al mismo usuario Windows
y las credenciales existentes siguen protegidas con DPAPI.

## Límites del piloto

- no crea una vinculación inicial ni solicita un código;
- no se distribuye a Julián ni a otras identidades hasta verificar inicio, versión
  0.16, heartbeat, inventario y ausencia de duplicados en la instalación piloto;
- el ejecutable no tiene todavía firma comercial. Windows puede mostrar una
  advertencia de editor desconocido; la versión general deberá firmarse;
- la actualización no cambia contabilidad, clasificación de cuentas ni registros.

## Validación requerida

1. Ejecutar el instalador con NinjaTrader cerrado.
2. Abrir NinjaTrader desde el botón final.
3. Confirmar en NODAL que el conector informa versión 0.16 y permanece en línea
   durante varias ventanas de sesenta segundos sin recompilar.
4. Confirmar que el inventario y los saldos coinciden y que no aparecen eventos
   duplicados.
5. Cerrar y abrir NinjaTrader nuevamente y repetir la comprobación.

Sólo después de aprobar el piloto se incorpora el código temporal para altas nuevas,
la firma del ejecutable, la descarga desde la app y el despliegue gradual.
