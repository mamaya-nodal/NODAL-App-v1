# MIMICAL integrado con NODAL App

Base operativa recibida el 26 de octubre de 2026 y verificada antes de modificarla:

- fuente original: `8E060FDA387FE13C745AF3A10A959669B6EF20D784A977C5A298FD35BDE4C4AE`;
- DLL original 1.0.0.2: `B7BC823F6CBE12AF10BD08485DA1FE0488F96BDE9CD8119B82E9FBA1AB9C48F0`;
- ZIP original: `665792334447CE023205A447B5A5E8EF42585A9DFB0F674AFCC65755CB0EBA6C`.

La versión 1.1 agrega vinculación por instalación contra NODAL App sin modificar la
regla de protección del motor: un problema de licencia puede impedir el siguiente
ciclo, pero nunca cancelar ni abandonar el ciclo activo.

## Verificación local

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integrations\mimical\Compilar.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integrations\mimical\tests\Test-MimicalV1.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integrations\mimical\tests\Test-CrossedEntry.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integrations\mimical\tests\Test-CrossedEntryEvidence.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\integrations\mimical\tests\Test-MimicalLicense.ps1
```

El artefacto servido por la app está en `private/downloads/MIMICAL-NodalBots.zip`.
No contiene credenciales ni un código prefijado; el código se genera después de la
autenticación Google y se canjea una sola vez.
