$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$engine = Get-Content -LiteralPath (Join-Path $root 'src\Mimical.cs') -Raw
$license = Get-Content -LiteralPath (Join-Path $root 'src\MimicalLicense.cs') -Raw

$checks = @(
    @{ Name = 'La ventana exige licencia antes de armar'; Pass = $engine.Contains('if (!licenseAuthorized) throw new InvalidOperationException') },
    @{ Name = 'La validación se ejecuta fuera del bloqueo de órdenes'; Pass = $engine.Contains('licenseClient.ValidateAsync') -and -not $engine.Contains('lock (gate)`r`n            {`r`n                licenseClient.ValidateAsync') },
    @{ Name = 'La licencia no toca Flatten ni cierra cuentas'; Pass = -not $license.Contains('.Flatten(') -and -not $license.Contains('.Cancel(') },
    @{ Name = 'Una salida del líder sigue procesándose sin licencia'; Pass = $engine.Contains('if (IsClose(order)) FlattenFollowers') },
    @{ Name = 'Sólo se bloquea el comienzo de un ciclo nuevo'; Pass = $engine.Contains('startsNewCycle && !licenseAuthorized') },
    @{ Name = 'El token se protege con DPAPI'; Pass = $license.Contains('ProtectedData.Protect') -and $license.Contains('DataProtectionScope.CurrentUser') },
    @{ Name = 'El código se canjea en el servidor NODAL'; Pass = $license.Contains('/api/integrations/mimical/activate') },
    @{ Name = 'La autorización se revalida periódicamente'; Pass = $engine.Contains('DateTime.UtcNow.AddMinutes(1)') -and $license.Contains('/api/integrations/mimical/validate') }
)

$failed = @($checks | Where-Object { -not $_.Pass })
foreach ($check in $checks) { if ($check.Pass) { "OK: $($check.Name)" } else { "FALLO: $($check.Name)" } }
if ($failed.Count) { throw "Licenciamiento MIMICAL: $($failed.Count) controles fallaron." }
"LICENCIAMIENTO MIMICAL: $($checks.Count)/$($checks.Count) controles aprobados."
