# Investigacion FTMO Futures para deteccion automatica

- Fecha: `2026-09-21`.
- Estado: deteccion y riesgo de evaluaciones Growth 50K implementados; nomenclaturas funded y live pendientes de evidencia.
- Propietarios funcionales: Operaciones y Rutas para reglas de riesgo; Producto y Tecnologia para la implementacion.

## Evidencia recibida

Se observaron tres cuentas de evaluacion 50K:

- `FTMO157754`;
- `FTMO384610`;
- `FTMO314114`.

El usuario confirmo que estas cuentas pertenecen al producto Growth. El patron confirmado para este corte es `^FTMO\d+$`. No se extiende a guiones, letras posteriores ni coincidencias parciales.

## Fuentes oficiales consultadas

FTMO Futures confirma que:

- NinjaTrader es una plataforma soportada;
- existen productos Growth y Pro en tamanos 50K, 100K y 150K;
- la evaluacion 50K requiere un objetivo de USD 3.000;
- Growth 50K usa Max Drawdown EOD trailing de USD 2.000 y no tiene Daily Loss Limit durante la evaluacion;
- Pro 50K usa Max Drawdown EOD trailing de USD 3.000 y un Daily Loss Limit duro de USD 1.000;
- al superar la evaluacion se entrega una cuenta Sim-Funded del mismo tamano;
- una cuenta Live Funded solo se entrega por decision discrecional de FTMO.

Fuentes:

- `https://ftmo.com/en/futures/trading-platforms/`
- `https://ftmo.com/en/futures/trading-objectives-and-rules/`
- `https://ftmo.com/en/futures/faq/how-do-the-growth-and-pro-products-differ/`
- `https://ftmo.com/en/futures/faq/who-is-an-ftmo-trader-and-how-do-i-become-one/`

## Decision tecnica segura

La aplicacion clasifica `FTMO` seguido exclusivamente por digitos como:

- empresa: `FTMO`;
- tamano: USD 50.000;
- estado operativo: `Evaluation`;
- producto: `Growth`.

La cuenta puede detectarse, presentarse, registrarse y seguirse con la regla Growth 50K confirmada:

- piso inicial: USD 48.000;
- trailing: mayor cierre EOD previo menos USD 2.000;
- bloqueo maximo del piso: USD 50.000;
- objetivo de evaluacion: USD 53.000;
- sin Daily Loss Limit durante la evaluacion.

Para Sim-Funded Growth, FTMO publica el mismo Max Drawdown EOD trailing de USD 2.000 y un Daily Loss Limit soft de USD 1.000. Ese limite diario soft no debe cerrar la cuenta en NODAL. La aplicacion no clasificara automaticamente Sim-Funded hasta conocer su nomenclatura real.

## Pendientes de evidencia

1. Obtener al menos un nombre real de Sim-Funded Growth y uno de Sim-Funded Pro.
2. Obtener, si existe, el nombre real de una cuenta Live Funded.
3. Confirmar si NinjaTrader expone en `connectionName`, `providerName` u otro campo una señal estable de fase.
4. Agregar el matcheo Evaluation a Sim-Funded cuando exista esa evidencia.
5. Validar con una prueba real que la liquidacion y desaparicion informadas por NinjaTrader coinciden con la regla oficial Growth.
