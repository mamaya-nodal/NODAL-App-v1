# MIMICAL integrado con NODAL App

Base operativa recibida el 26 de octubre de 2026 y verificada antes de modificarla:

- fuente original: `8E060FDA387FE13C745AF3A10A959669B6EF20D784A977C5A298FD35BDE4C4AE`;
- DLL original 1.0.0.2: `B7BC823F6CBE12AF10BD08485DA1FE0488F96BDE9CD8119B82E9FBA1AB9C48F0`;
- ZIP original: `665792334447CE023205A447B5A5E8EF42585A9DFB0F674AFCC65755CB0EBA6C`.

La versión 1.1 agrega vinculación por instalación contra NODAL App sin modificar la
regla de protección del motor: un problema de licencia puede impedir el siguiente
ciclo, pero nunca cancelar ni abandonar el ciclo activo.

## Corrección Stop Limit — 26 de octubre de 2026

FileVersion `1.1.0.1` (AssemblyVersion y protocolo de licencia `1.1.0`). Admite
entradas Buy Stop Limit y Sell Stop Limit con precios de activación y límite
distintos. Un ratio positivo conserva ambos precios. Un ratio negativo coloca
la orden Limit opuesta en el precio de activación, igual que al invertir una
Stop Market. El margen de ejecución de la líder no desplaza la entrada inversa.
El mismo transformador se utiliza al mover órdenes y para las salidas ATM.

La regresión `tests/Test-StopLimit.ps1` llama a `Transform` del motor compilado
sin conectar cuentas ni enviar órdenes; incluye los cuatro incidentes del piloto,
ambos sentidos, ratios positivos/negativos y decimales, cambios de precio y
salidas ATM. El registro CONFIG identifica esta corrección como
`1.1.0.1-stoplimit`. Ver `docs/MIMICAL_STOPLIMIT_2026-10-26.md` desde la raíz del
repositorio para evidencia, alcance y recuperación.

## Verificación local

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integrations\mimical\Compilar.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integrations\mimical\tests\Test-MimicalV1.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integrations\mimical\tests\Test-CrossedEntry.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integrations\mimical\tests\Test-CrossedEntryEvidence.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integrations\mimical\tests\Test-MimicalLicense.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integrations\mimical\tests\Test-StopLimit.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integrations\mimical\Empaquetar.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integrations\mimical\tests\Test-MimicalPackage.ps1
```

El artefacto servido por la app está en `private/downloads/MIMICAL-NodalBots.zip`.
No contiene credenciales ni un código prefijado; el código se genera después de la
autenticación Google y se canjea una sola vez.

El importador de NinjaTrader exige `Info.xml` en la raíz del ZIP. El paquete debe
contener exactamente `Info.xml`, `AdditionalReferences.txt`, `Mimical.cs` y
`NodalBots.Mimical.dll`, sin una carpeta contenedora adicional.
