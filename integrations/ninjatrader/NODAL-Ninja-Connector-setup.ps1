param(
  [string]$BaseUrl = "https://nodal-app-preview.vercel.app",
  [string]$PairingCode = "",
  [switch]$UpdateOnly
)

$ErrorActionPreference = "Stop"

$normalizedBaseUrl = $BaseUrl.Trim().TrimEnd('/')
if ($normalizedBaseUrl -notmatch '^https?://') {
  throw "La direccion de NODAL debe comenzar con http:// o https://."
}

$ninjaPath = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "NinjaTrader 8"
if (!(Test-Path -LiteralPath $ninjaPath)) {
  throw "No se encontro la carpeta de NinjaTrader 8 en Documentos."
}

$connectorDirectory = Join-Path $ninjaPath "NODAL"
$connectorConfigPath = Join-Path $connectorDirectory "nodal-ninja-connector.config"
$addOnDirectory = Join-Path $ninjaPath "bin\Custom\AddOns"
$connectorSourcePath = Join-Path $PSScriptRoot "NodalNinjaConnector.cs"
$installedConnectorPath = Join-Path $addOnDirectory "NodalNinjaConnector.cs"

if (!(Test-Path -LiteralPath $connectorSourcePath)) {
  throw "No se encontro NodalNinjaConnector.cs junto al instalador."
}

if ($UpdateOnly) {
  if (!(Test-Path -LiteralPath $connectorConfigPath) -or !(Test-Path -LiteralPath $installedConnectorPath)) {
    throw "No se encontro una instalacion existente. Usa INSTALAR-NODAL para la primera vinculacion."
  }

  New-Item -ItemType Directory -Force -Path $connectorDirectory | Out-Null
  # Back up source outside AddOns to avoid compiling a duplicate class.
  $backupSource = Join-Path $connectorDirectory ("connector-source-" + [Guid]::NewGuid().ToString("N") + ".bak")
  Copy-Item -LiteralPath $installedConnectorPath -Destination $backupSource
  Copy-Item -LiteralPath $connectorSourcePath -Destination $installedConnectorPath -Force

  if ([string]::IsNullOrWhiteSpace($PairingCode)) {
    Write-Output "Conector actualizado. Tus vinculos, historial y cola de datos se conservaron."
    $PairingCode = Read-Host "Para agregar otro vinculo, pega su codigo. Si solo querias actualizar, presiona ENTER"
  }

  if ([string]::IsNullOrWhiteSpace($PairingCode)) {
    Write-Output "Actualizacion terminada sin agregar otro vinculo. Compila NodalNinjaConnector en NinjaTrader."
    exit 0
  }
} elseif ([string]::IsNullOrWhiteSpace($PairingCode)) {
  $PairingCode = Read-Host "Pega el codigo de vinculacion que muestra NODAL"
}

$normalizedCode = ($PairingCode.ToUpperInvariant() -replace '[^A-Z0-9]', '')
if ($normalizedCode -notmatch '^[A-Z0-9]{8}$') {
  throw "El codigo debe tener 8 caracteres. Genera uno nuevo desde NODAL y volve a intentarlo."
}

New-Item -ItemType Directory -Force -Path $connectorDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $addOnDirectory | Out-Null
if (Test-Path -LiteralPath $connectorConfigPath) {
  Copy-Item -LiteralPath $connectorConfigPath -Destination ($connectorConfigPath + ".before-pairing.bak") -Force
  $existingLines = Get-Content -LiteralPath $connectorConfigPath
  $keptLines = @($existingLines | Where-Object { $_ -notmatch '^(BaseUrl|PairingCode)=' })
  @(
    "BaseUrl=$normalizedBaseUrl"
    "PairingCode=$normalizedCode"
  ) + $keptLines | Set-Content -LiteralPath $connectorConfigPath -Encoding utf8
} else {
  @(
    "BaseUrl=$normalizedBaseUrl"
    "PairingCode=$normalizedCode"
  ) | Set-Content -LiteralPath $connectorConfigPath -Encoding utf8
}

Copy-Item -LiteralPath $connectorSourcePath -Destination $installedConnectorPath -Force

if ($UpdateOnly) {
  Write-Output "Conector actualizado y nuevo vinculo preparado. Los vinculos anteriores y el historial se conservaron."
} else {
  Write-Output "Conector preparado para NODAL. Si ya estaba instalado, sus vinculos e historial se conservaron."
}
Write-Output "Ahora compila NodalNinjaConnector en NinjaTrader; el codigo se canjeara una sola vez."
