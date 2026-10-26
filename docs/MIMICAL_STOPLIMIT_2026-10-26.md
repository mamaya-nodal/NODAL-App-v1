# MIMICAL 1.1.0.1 — corrección de entradas Stop Limit

Fecha: 26 de octubre de 2026. Propietario: Producto y Tecnología de NODAL.

Estado: código corregido, compilado y verificado de forma aislada. Paquete de actualización preparado. Sin nueva prueba de envío de órdenes dentro de NinjaTrader en esta ronda.

## Incidente confirmado

Los registros SIM aportados del piloto identifican `build=1.1.0-nodal-license`, líder `Sim101` y seguidora `SimAccount1`, ratio -1, NQ DEC26. La venta Limit anterior se replicó y sus modificaciones se transmitieron. Cuatro entradas Buy StopLimit posteriores fueron bloqueadas por `Combinación inversa no validada`.

| Registro | Hora ART del bloqueo | Activación | Límite |
|---|---|---:|---:|
| 20261026_145548_971.tsv | 14:57:49 | 29541.50 | 29541.75 |
| 20261026_145753_887.tsv | 14:57:57 | 29550.00 | 29550.25 |
| 20261026_145805_161.tsv | 14:58:13 | 29554.50 | 29554.75 |
| 20261026_145821_048.tsv | 14:58:24 | 29544.00 | 29544.25 |

No se trataba del trailing ni del control de licencia. La orden ya estaba informada como StopLimit desde Initialized. Los registros no muestran los clics ni el texto del menú seleccionado; no permiten atribuir un error de operación al usuario.

## Causa y corrección

`integrations/mimical/src/Mimical.cs`, método `MimicalWindow.Transform`, aceptaba StopLimit inversas solamente cuando `Same(limit, stop)` era verdadero. Un offset de un tick bastaba para lanzar una excepción y activar el bloqueo del copiador.

Se elimina esa restricción de igualdad. Se conserva la transformación que ya existía para StopLimit sin offset y para StopMarket:

- Ratio positivo: misma acción, StopLimit, conserva activación y límite.
- Ratio negativo, Buy StopLimit: SellShort Limit al precio de activación.
- Ratio negativo, Sell/SellShort StopLimit: Buy/BuyToCover Limit al precio de activación, según la posición actual de la seguidora.
- El margen de ejecución límite de la líder no se utiliza como un segundo precio de activación de la inversa.

El mismo método procesa el alta, los cambios de precio y las salidas ATM. Se conserva la lógica existente de cantidades, ratios, Cross Order, OCO, seguimiento manual y trailing. No se cambian reglas de ruta ni parámetros ATM.

La regla general de invertir stops en órdenes límite coincide con la descripción oficial de [FlowBots sobre ratios negativos](https://flowbots.ninja/product/replikanto/). Esto no constituye una certificación de equivalencia completa de ejecución entre productos.

## Validación

`integrations/mimical/tests/Test-StopLimit.ps1` invoca el método real Transform del motor compilado mediante objetos inertes. No abre ventanas, conecta cuentas, suscribe precios ni llama Submit/Change/Cancel.

- Antes de la corrección: reproduce el bloqueo de los cuatro casos aportados y de las variantes simétricas; 38 casos con offset fallan.
- Después: 324 comprobaciones aprobadas, incluidas compras y ventas, offsets cero/uno/varios ticks y negativos, ratios 1/2/0.34/-1/-2/-0.34, cambios de activación y de sólo offset, salidas ATM, regresiones Limit/Market/StopMarket y controles de instrumento/cantidad.
- Suite previa: 51 controles de motor/trailing, 31 de recuperación de entradas, verificador de evidencias SIM existentes y 8 controles de licencia aprobados.
- ZIP: cuatro archivos esperados en la raíz; Info.xml, referencias y cabecera de DLL correctos. Hash de la DLL extraída coincide con el compilado probado.

Estas pruebas demuestran la corrección de la transformación y las regresiones indicadas. No sustituyen una nueva prueba SIM de colocación, ejecución, modificación y cancelación en NinjaTrader. No se declara completada esa prueba en vivo ni una validación nueva de conexiones reales.

## Versión y artefactos

- AssemblyVersion: 1.1.0.0, conservada para compatibilidad.
- FileVersion: 1.1.0.1.
- Protocolo de licencia: 1.1.0, conservado; no requiere volver a vincular.
- Identificador CONFIG: `build=1.1.0.1-stoplimit`.
- ZIP del repositorio: `private/downloads/MIMICAL-NodalBots.zip`.
- Copia para entregar: `C:\Users\mauri\Downloads\MIMICAL-1.1.0.1-NodalBots.zip`.
- SHA256 ZIP: `CFA20A84851E92FFD99E9E75E8D2AF76CCBC14ADCBB6E933B51124B76EF9B045`.
- SHA256 DLL: `D99EC161AD68A994161C96A6789F5FFF703DDEE6BB6E28708064E67170A0DD3A`.

El archivo servido por la app conserva su nombre general. Su nombre de descarga anunciado por la app sigue siendo el de la familia 1.1.0; el patch se distingue por FileVersion y CONFIG. La publicación de una web o descarga remota sólo se confirma si se verifica por separado el despliegue correspondiente.

## Aplicación y recuperación

Antes de actualizar una PC, terminar el ciclo activo y comprobar que no hay posiciones ni órdenes pendientes. Importar el ZIP desde Herramientas > Importar > Complemento NinjaScript, aceptar el reemplazo y reiniciar NinjaTrader para cargar el nuevo assembly. No borrar settings.txt ni license.txt. Probar primero con cuentas SIM.

Checkpoint local previo al cambio: `outputs/mimical_stoplimit_20261026_152150/`. Incluye fuente, pruebas, empaquetado, ZIP anterior y DLL instalada previa, con manifiesto de hashes. Para volver atrás, cerrar NinjaTrader cuando no exista un ciclo activo y restaurar el ZIP/DLL previo; las credenciales y configuraciones de las cuentas no forman parte de este cambio.
