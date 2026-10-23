$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $repoRoot "output\NODAL-Conector-0.16.exe"
if (!(Test-Path -LiteralPath $exe)) { throw "Primero ejecuta scripts/build-ninja-pilot-installer.ps1" }

$testRoot = Join-Path $repoRoot ("tmp\ninja-installer-test-" + [Guid]::NewGuid().ToString("N"))
$validRoot = Join-Path $testRoot "valid\NinjaTrader 8"
$invalidRoot = Join-Path $testRoot "invalid\NinjaTrader 8"
$freshRoot = Join-Path $testRoot "fresh\NinjaTrader 8"
$missingTicketRoot = Join-Path $testRoot "missing-ticket\NinjaTrader 8"
foreach ($root in @($validRoot, $invalidRoot, $freshRoot, $missingTicketRoot)) {
  New-Item -ItemType Directory -Force -Path (Join-Path $root "NODAL") | Out-Null
}

$validConfig = @(
  "BaseUrl=https://nodal-app-preview.vercel.app"
  "PairingCode="
  "InstalledSourceVersion=0.15"
  "ConnectorId=11111111-1111-1111-1111-111111111111"
  "AccessTokenProtected=TEST_ACCESS"
  "AccessExpiresAtUtc=2026-10-23T12:00:00.0000000Z"
  "RefreshTokenProtected=TEST_REFRESH"
  "RefreshExpiresAtUtc=2030-10-23T12:00:00.0000000Z"
)
$invalidConfig = $validConfig.Clone()
$invalidConfig[0] = "BaseUrl=https://malicious.invalid"
[IO.File]::WriteAllLines((Join-Path $validRoot "NODAL\nodal-ninja-connector.config"), $validConfig, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllLines((Join-Path $invalidRoot "NODAL\nodal-ninja-connector.config"), $invalidConfig, [Text.UTF8Encoding]::new($false))

$sessionPath = Join-Path $testRoot "pairing-session.json"
$session = @{
  ConnectorId = "22222222-2222-4222-8222-222222222222"
  AccessToken = "TEST_ACCESS_TOKEN"
  AccessExpiresAt = "2030-10-23T12:00:00.0000000Z"
  RefreshToken = "TEST_REFRESH_TOKEN"
  RefreshExpiresAt = "2030-12-23T12:00:00.0000000Z"
} | ConvertTo-Json -Compress
[IO.File]::WriteAllText($sessionPath, $session, [Text.UTF8Encoding]::new($false))
$ticketedExe = Join-Path $testRoot "NODAL-Conector-0.16-ENLACE-ABCD2345 (1).exe"
Copy-Item -LiteralPath $exe -Destination $ticketedExe -Force

$previousTestMode = $env:NODAL_INSTALLER_TEST
try {
  $env:NODAL_INSTALLER_TEST = "1"
  $valid = Start-Process -FilePath $exe -ArgumentList @('--test-root', ('"' + $validRoot + '"'), '--silent', '--no-launch') -Wait -PassThru
  if ($valid.ExitCode -ne 0) { throw "La instalacion valida devolvio $($valid.ExitCode)." }

  $runtimeConfig = Join-Path $validRoot "NODAL\nodal-ninja-connector-v2.config"
  $runtimeDll = Join-Path $validRoot "bin\Custom\Nodal.NinjaConnector.dll"
  $legacyConfig = Join-Path $validRoot "NODAL\nodal-ninja-connector.config"
  if (!(Test-Path -LiteralPath $runtimeConfig) -or !(Test-Path -LiteralPath $runtimeDll)) { throw "Faltan archivos instalados." }
  if ((Get-Content -LiteralPath $runtimeConfig -Raw) -notmatch 'InstalledSourceVersion=0\.16') { throw "La configuracion nueva no informa 0.16." }
  if ((Get-Content -LiteralPath $runtimeConfig -Raw) -notmatch '(?m)^BaseUrl=https://app\.nodaltrading\.com\r?$') { throw "El dominio de compatibilidad no se migro a produccion." }
  if ((Get-Content -LiteralPath $legacyConfig -Raw) -notmatch '(?m)^BaseUrl=\r?$') { throw "El runtime anterior no quedo deshabilitado." }
  if (@(Get-ChildItem -LiteralPath (Join-Path $validRoot "NODAL\installer-backups") -File -Recurse).Count -lt 1) { throw "No se creo respaldo." }

  $invalid = Start-Process -FilePath $exe -ArgumentList @('--test-root', ('"' + $invalidRoot + '"'), '--silent', '--no-launch') -Wait -PassThru
  if ($invalid.ExitCode -eq 0) { throw "El instalador acepto un destino no oficial." }
  if (Test-Path -LiteralPath (Join-Path $invalidRoot "bin\Custom\Nodal.NinjaConnector.dll")) { throw "El caso rechazado dejo un modulo instalado." }

  $fresh = Start-Process -FilePath $ticketedExe -ArgumentList @('--test-root', ('"' + $freshRoot + '"'), '--test-session-file', ('"' + $sessionPath + '"'), '--silent', '--no-launch') -Wait -PassThru
  if ($fresh.ExitCode -ne 0) { throw "La instalacion nueva devolvio $($fresh.ExitCode)." }
  $freshConfig = Join-Path $freshRoot "NODAL\nodal-ninja-connector-v2.config"
  $freshText = Get-Content -LiteralPath $freshConfig -Raw
  if ($freshText -notmatch '(?m)^ConnectorId=22222222-2222-4222-8222-222222222222\r?$') { throw "La vinculacion automatica no guardo el conector." }
  if ($freshText -match 'TEST_(ACCESS|REFRESH)_TOKEN') { throw "La configuracion guardo secretos sin proteger." }
  if ($freshText -notmatch '(?m)^PairingCode=\r?$') { throw "La primera instalacion conservo indebidamente el ticket consumido." }

  $missing = Start-Process -FilePath $exe -ArgumentList @('--test-root', ('"' + $missingTicketRoot + '"'), '--silent', '--no-launch') -Wait -PassThru
  if ($missing.ExitCode -eq 0) { throw "Una instalacion nueva sin autorizacion fue aceptada." }
  if (Test-Path -LiteralPath (Join-Path $missingTicketRoot "bin\Custom\Nodal.NinjaConnector.dll")) { throw "El caso sin autorizacion dejo un modulo instalado." }

  Write-Output "NINJA_INSTALLER_TESTS_OK"
}
finally {
  $env:NODAL_INSTALLER_TEST = $previousTestMode
  $resolvedTestRoot = [IO.Path]::GetFullPath($testRoot)
  $resolvedTmp = [IO.Path]::GetFullPath((Join-Path $repoRoot "tmp")) + [IO.Path]::DirectorySeparatorChar
  if ($resolvedTestRoot.StartsWith($resolvedTmp, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $resolvedTestRoot)) {
    Remove-Item -LiteralPath $resolvedTestRoot -Recurse -Force
  }
}
