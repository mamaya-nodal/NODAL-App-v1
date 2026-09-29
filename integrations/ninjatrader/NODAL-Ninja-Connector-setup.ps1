param(
  [string]$BaseUrl = "https://nodal-app-preview.vercel.app",
  [string]$PairingCode = "",
  [switch]$UpdateOnly
)

$ErrorActionPreference = "Stop"

if ($UpdateOnly) {
  $ninjaUpdatePath = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "NinjaTrader 8"
  $existingConfig = Join-Path $ninjaUpdatePath "NODAL\nodal-ninja-connector.config"
  $targetSource = Join-Path $ninjaUpdatePath "bin\Custom\AddOns\NodalNinjaConnector.cs"
  $updatedSource = Join-Path $PSScriptRoot "NodalNinjaConnector.cs"
  if (!(Test-Path -LiteralPath $existingConfig) -or !(Test-Path -LiteralPath $targetSource)) {
    throw "No se encontró una instalación existente. Usá INSTALAR-NODAL para la primera vinculación."
  }
  if (!(Test-Path -LiteralPath $updatedSource)) { throw "Falta el archivo del conector actualizado." }
  # Back up source outside AddOns to avoid compiling a duplicate class.
  $backupSource = Join-Path $ninjaUpdatePath ("NODAL\connector-source-" + [Guid]::NewGuid().ToString("N") + ".bak")
  Copy-Item -LiteralPath $targetSource -Destination $backupSource
  Copy-Item -LiteralPath $updatedSource -Destination $targetSource -Force
  Write-Output "Conector actualizado. La vinculación y la cola de datos se conservaron. Compilá NodalNinjaConnector en NinjaTrader."
  exit 0
}

if ([string]::IsNullOrWhiteSpace($PairingCode)) {
  $PairingCode = Read-Host "Pegá el código de vinculación que muestra NODAL"
}

$normalizedCode = ($PairingCode.ToUpperInvariant() -replace '[^A-Z0-9]', '')
if ($normalizedCode -notmatch '^[A-Z0-9]{8}$') {
  throw "El código debe tener 8 caracteres. Generá uno nuevo desde NODAL y volvé a intentarlo."
}

$normalizedBaseUrl = $BaseUrl.Trim().TrimEnd('/')
if ($normalizedBaseUrl -notmatch '^https?://') {
  throw "La dirección de NODAL debe comenzar con http:// o https://."
}

$ninjaPath = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "NinjaTrader 8"
if (!(Test-Path -LiteralPath $ninjaPath)) {
  throw "No se encontró la carpeta de NinjaTrader 8 en Documentos."
}

$connectorDirectory = Join-Path $ninjaPath "NODAL"
$connectorConfigPath = Join-Path $connectorDirectory "nodal-ninja-connector.config"
$addOnDirectory = Join-Path $ninjaPath "bin\Custom\AddOns"
$connectorSourcePath = Join-Path $PSScriptRoot "NodalNinjaConnector.cs"
$installedConnectorPath = Join-Path $addOnDirectory "NodalNinjaConnector.cs"

if (!(Test-Path -LiteralPath $connectorSourcePath)) {
  throw "No se encontró NodalNinjaConnector.cs junto al instalador."
}

New-Item -ItemType Directory -Force -Path $connectorDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $addOnDirectory | Out-Null
if (Test-Path -LiteralPath $connectorConfigPath) {
  Copy-Item -LiteralPath $connectorConfigPath -Destination ($connectorConfigPath + ".before-pairing.bak") -Force
}
@(
  "BaseUrl=$normalizedBaseUrl"
  "PairingCode=$normalizedCode"
) | Set-Content -LiteralPath $connectorConfigPath -Encoding utf8

Copy-Item -LiteralPath $connectorSourcePath -Destination $installedConnectorPath -Force

Write-Output "Conector instalado para NODAL App. Ahora compilá NodalNinjaConnector en NinjaTrader; el código se canjeará una sola vez."
