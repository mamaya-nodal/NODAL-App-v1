# Instalador ejecutable del conector Ninja

## Alcance autorizado

El ejecutable 0.16 fue validado primero sobre la instalación de Mauricio. La versión
general utiliza el mismo binario para instalaciones nuevas, actualizaciones y PCs de
identidades. La autorización es contextual, temporal y automática: la app la incorpora
en el nombre de descarga y nadie debe copiar o ingresar un código manualmente.

## Comportamiento

- exige que NinjaTrader esté cerrado;
- detecta `Documentos\NinjaTrader 8` y si existe una sesión NODAL vigente;
- en una instalación nueva canjea la autorización antes de guardar la sesión;
- en una actualización conserva la sesión y deja que el runtime confirme o agregue
  el destino solicitado;
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

## Distribución

- la app entrega el `.exe` mediante POST autenticado y no conserva el archivo en caché;
- el nombre contiene únicamente una autorización aleatoria de un solo uso que vence
  a los cinco minutos; no contiene nombres, correos, IDs ni credenciales permanentes;
- el correo de una identidad crea la autorización recién cuando se consume su enlace;
- el ejecutable no tiene todavía firma comercial porque no existe un certificado de
  firma instalado. Windows puede mostrar una advertencia de editor desconocido;
- la actualización no cambia contabilidad, clasificación de cuentas ni registros.

## Validación requerida

1. Ejecutar el instalador con NinjaTrader cerrado.
2. Abrir NinjaTrader desde el botón final.
3. Confirmar en NODAL que el conector informa versión 0.16 y permanece en línea
   durante varias ventanas de sesenta segundos sin recompilar.
4. Confirmar que el inventario y los saldos coinciden y que no aparecen eventos
   duplicados.
5. Cerrar y abrir NinjaTrader nuevamente y repetir la comprobación.
6. En una PC limpia, verificar que el archivo descargado desde la app crea el vínculo
   sin pedir un código, abre NinjaTrader y emite la primera señal.
