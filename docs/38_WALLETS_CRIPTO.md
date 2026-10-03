# Billeteras manuales y lectura cripto

Fecha: 2026-10-03. Implementación local autorizada por Mauricio. **No activada ni publicada.**

## Alcance implementado

- Se conservan billeteras, movimientos, cobros y saldos contables existentes.
- En Otros saldos, «Identidades y conexión de billeteras» asigna una identidad y, opcionalmente, una dirección pública EVM a una billetera existente. Para una cuenta nueva, crear otra billetera sin saldo inicial y conectar su dirección. No se solicita firma, contraseña, seed ni permisos de gasto.
- Una dirección por billetera; varias cuentas de MetaMask/Trust Wallet son billeteras distintas si tienen distintas direcciones. La misma dirección en dos aplicaciones no se cuenta dos veces dentro del workspace.
- La dirección se fija al conectar, para no mezclar historiales; la identidad puede cambiar con auditoría. No se convierten observaciones en aportes ni beneficios.
- Lecturas de saldo y entradas/salidas de contratos admitidos. La suma es **nominal en tokens**, no cotización USD ni totalidad del patrimonio cripto. El saldo contable USD sigue separado. No se introduce una regla contable de paridad ni revaluación.
- El primer saldo observado no crea un aporte. El saldo anterior necesita revisar su origen y la apertura/migración ya existente. Se detectan transferencias desde la vinculación, no se importa todo el pasado.
- Los movimientos se vinculan explícitamente a movimientos o cobros ya registrados del período seleccionado. La base valida titular, workspace, período abierto, misma billetera, fecha Argentina, dirección e importe neto. Un registro no admite dos vinculaciones para la misma billetera. Una transferencia interna admite sus dos extremos sin duplicar el asiento.
- El pago de la prop no se identifica por una entrada cualquiera: primero se registra/confirma en Payouts y luego se vincula. La lectura no modifica fases ni cuenta payouts por sí sola.

## Cobertura inicial explícita

| Red | Contratos admitidos |
| --- | --- |
| Ethereum | USDT y USDC nativos |
| Avalanche C-Chain | USDT y USDC nativos |
| Base | USDC nativo |
| Arbitrum | USDC nativo y USDT0 |
| Polygon | USDC nativo y USDT0 |

USDT0 se identifica por su contrato, no por símbolos arbitrarios; es la representación de USDT indicada en las fuentes del emisor. No se incluyen Tron, Solana, BNB Chain, otras redes, USDC.e ni otros wrappers, staking, préstamos, gas en ETH ni BTC. Se muestra esta limitación en la interfaz. Ampliar cobertura requiere verificar contratos, proveedor y pruebas; no prometer cobertura universal de MetaMask o Trust Wallet.

Fuentes verificadas:
- https://developers.circle.com/stablecoins/usdc-contract-addresses
- https://tether.to/en/supported-protocols/
- https://usdt0.to/ecosystem/arbitrum
- https://usdt0.to/ecosystem/polygon
- https://docs.moralis.com/data-api/evm/wallet/token-balances
- https://docs.moralis.com/data-api/evm/wallet/token-transfers

## Operación y seguridad

`MORALIS_API_KEY` sólo en servidor. Sin clave, la interfaz indica pendiente y el cron no consulta al proveedor. El usuario todavía no tiene cuenta de Moralis. No se contrataron servicios ni planes.

Cron `/api/cron/wallets`, cada 15 minutos, autorizado con `CRON_SECRET`. Hasta 10 billeteras por ejecución, empezando por lecturas más antiguas; más de 10 billeteras pueden requerir varios ciclos. No prometer tiempo real. Cada billetera tiene lease y cooldown, máximo 20 segundos de consulta y paginación acotada. Si alguna red falla no se publica un total parcial ni se reemplaza por cero la última lectura.

Transferencias hasta cinco minutos antes de la consulta; superposición de 24 horas para demoras de indexación. Idempotencia por billetera/red/hash/índice del evento. Este margen **no equivale a garantía de finalidad on-chain**. Las reorganizaciones o retrasos mayores requieren revisión; no hay automatización de asientos ni reparación silenciosa. Lecturas y evidencia quedan separadas del libro.

Unidades exactas de seis decimales conservadas como texto; redondeo a centavos para presentación/vinculación, no uso de números flotantes para sumar unidades. Gas y operaciones complejas (pagos divididos, varios tokens en un mismo pago, puentes) no se concilian automáticamente. Las diferencias se mantienen pendientes.

RLS para lectura por propietario activo; configuración y vínculo por funciones validadas; ingesta sólo con rol de servicio. La vinculación no modifica ni crea movimientos económicos. Cierres históricos permanecen inmutables.

## Activación pendiente

1. Renovar sesión de administración Supabase: la CLI devolvió 401 Unauthorized. No se aplicó la migración remota.
2. Ejecutar migración y prueba SQL en entorno de desarrollo, siempre dentro de transacción con rollback para fixtures. No considerar autorizaciones/SQL verificados hasta pasar esta prueba.
3. Crear cuenta Moralis y comprobar límites/costos para la cantidad real de direcciones. Configurar la clave en Vercel sin compartirla por chat ni Git.
4. Probar una dirección de prueba con saldo y transferencias conocidas, incluyendo error de una red, repetición, ambos extremos y payout ya cobrado; revisar interfaz autenticada.
5. Publicar sólo tras la validación. No migrar usuarios de la planilla con esta entrega.

Validación local: TypeScript, build y 419 pruebas unitarias/regresión pasaron. ESLint sin errores (10 advertencias preexistentes). Prueba SQL y lectura real bloqueadas por los accesos anteriores. No se cambiaron datos económicos de usuarios.
