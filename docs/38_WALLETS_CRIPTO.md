# Billeteras manuales y lectura cripto

Fecha: 2026-10-03. Implementación autorizada por Mauricio y publicada en Producción. La clave de Alchemy quedó configurada como secreto en Vercel para Producción y Preview. La migración remota de Supabase fue aplicada, verificada y registrada como `20261003180000_wallet_observations`.

## Alcance implementado

- Se conservan billeteras, movimientos, cobros y saldos contables existentes.
- En Otros saldos, «Agregar billetera» comienza eligiendo ARQ, GrabrFi, Global66, MetaMask u Otra. Las tres primeras y Otra usan registro manual; Otra agrega el nombre de la empresa. MetaMask abre directamente la conexión automática con nombre, identidad y dirección pública EVM. No se solicita firma, contraseña, seed ni permisos de gasto.
- Una dirección por billetera; varias cuentas de MetaMask/Trust Wallet son billeteras distintas si tienen distintas direcciones. La misma dirección en dos aplicaciones no se cuenta dos veces dentro del workspace.
- Las billeteras manuales y automáticas pueden clasificarse como propias del titular o asignarse informativamente a una identidad. La asignación permite mostrar la billetera en la tarjeta de esa identidad, pero no divide ni modifica la contabilidad única del titular.
- El usuario puede eliminar una billetera solamente cuando su saldo contable es cero. Si nunca tuvo actividad se elimina; si conserva movimientos, cobros, compras, apertura u observaciones se archiva y deja de mostrarse, manteniendo intacta la trazabilidad.
- La dirección se fija al conectar, para no mezclar historiales; la identidad puede cambiar con auditoría. No se convierten observaciones en aportes ni beneficios.
- Lecturas de saldo y entradas/salidas de contratos admitidos. La suma es **nominal en tokens**, no cotización USD ni totalidad del patrimonio cripto. En la interfaz, una billetera manual muestra su saldo contable y una automática muestra su última lectura válida. El total disponible toma exactamente un saldo por billetera y nunca suma lectura y contabilidad entre sí. El saldo contable USD y la diferencia pendiente de conciliar siguen visibles por separado; no se introduce una regla contable de paridad ni revaluación.
- El primer saldo observado no crea un aporte. El saldo anterior necesita revisar su origen y la apertura/migración ya existente. Se detectan transferencias desde la vinculación, no se importa todo el pasado.
- Los movimientos se vinculan explícitamente a movimientos o cobros ya registrados del período seleccionado. La base valida titular, workspace, período abierto, misma billetera, fecha Argentina, dirección e importe neto. Un registro no admite dos vinculaciones para la misma billetera. Una transferencia interna admite sus dos extremos sin duplicar el asiento.
- El pago de la prop no se identifica por una entrada cualquiera: primero se registra/confirma en Payouts y luego se vincula. La lectura no modifica fases ni cuenta payouts por sí sola.

## Cobertura inicial explícita

| Red | Contratos admitidos |
| --- | --- |
| Ethereum | USDT y USDC nativos |
| Base | USDC nativo |
| Arbitrum | USDC nativo y USDT0 |
| Polygon | USDC nativo y USDT0 |

USDT0 se identifica por su contrato, no por símbolos arbitrarios; es la representación de USDT indicada en las fuentes del emisor. No se incluyen Tron, Solana, BNB Chain, Avalanche, otras redes, USDC.e ni otros wrappers, staking, préstamos, gas en ETH ni BTC. Se muestra esta limitación en la interfaz. Ampliar cobertura requiere verificar contratos, proveedor y pruebas; no prometer cobertura universal de MetaMask o Trust Wallet.

Fuentes verificadas:
- https://developers.circle.com/stablecoins/usdc-contract-addresses
- https://tether.to/en/supported-protocols/
- https://usdt0.to/ecosystem/arbitrum
- https://usdt0.to/ecosystem/polygon
- https://www.alchemy.com/docs/create-an-api-key
- https://www.alchemy.com/docs/data/token-api/token-api-endpoints/alchemy-get-token-balances
- https://www.alchemy.com/docs/data/transfers-api/transfers-endpoints/alchemy-get-asset-transfers
- https://www.alchemy.com/docs/reference/pricing-plans

## Operación y seguridad

`ALCHEMY_API_KEY` sólo en servidor. Sin clave, la interfaz indica pendiente y el cron no consulta al proveedor. Mauricio creó una cuenta gratuita de Alchemy y la clave se configuró en Vercel como secreto para Producción y Preview, sin guardarla en Git. No se contrató un plan pago.

Cron `/api/cron/wallets`, cada hora, autorizado con `CRON_SECRET`. Hasta 10 billeteras por ejecución, empezando por el último intento más antiguo para repartir el cupo incluso si alguna falla; más de 10 billeteras pueden requerir varios ciclos. No prometer tiempo real. Cada billetera tiene lease y cooldown, máximo 20 segundos de consulta y paginación acotada. Si alguna red falla no se publica un total parcial ni se reemplaza por cero la última lectura. La frecuencia y cantidad de direcciones deben compararse con los 30 millones de unidades de consumo gratuitas al mes; no hay garantía de que un número arbitrario de subcuentas entre en ese cupo.

Transferencias hasta cinco minutos antes de la consulta; superposición de 24 horas para demoras de indexación. Idempotencia por billetera/red/hash/índice del evento. Este margen **no equivale a garantía de finalidad on-chain**. Las reorganizaciones o retrasos mayores requieren revisión; no hay automatización de asientos ni reparación silenciosa. Lecturas y evidencia quedan separadas del libro.

Unidades exactas de seis decimales conservadas como texto; redondeo a centavos para presentación/vinculación, no uso de números flotantes para sumar unidades. Gas y operaciones complejas (pagos divididos, varios tokens en un mismo pago, puentes) no se concilian automáticamente. Las diferencias se mantienen pendientes.

RLS para lectura por propietario activo; configuración y vínculo por funciones validadas; ingesta sólo con rol de servicio. La vinculación no modifica ni crea movimientos económicos. Cierres históricos permanecen inmutables.

## Validación operativa pendiente

1. Medir el consumo real de unidades de Alchemy antes de ampliar frecuencia o redes. La app «Nodal app» tiene Ethereum, Base, Arbitrum y Polygon Mainnet habilitadas.
2. Conectar una dirección de prueba con saldo y transferencias conocidas y verificar la primera ejecución real del cron, incluyendo error de una red, repetición, ambos extremos y payout ya cobrado.
3. No migrar usuarios de la planilla con esta entrega; la activación inicial se valida con una billetera de prueba.

Validación: TypeScript, build y 419 pruebas unitarias/regresión pasaron. ESLint sin errores (10 advertencias preexistentes). En Supabase se verificaron las dos tablas, dos políticas RLS, RLS activo y permisos de funciones por rol; la migración quedó registrada en el historial. La aplicación publicada carga el bloque de conexión sin errores. La lectura real queda pendiente hasta conectar una dirección de prueba. No se cambiaron datos económicos de usuarios.
