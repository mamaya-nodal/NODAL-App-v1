param(
  [string]$BaseUrl = "https://app.nodaltrading.com",
  [string]$PairingCode = "",
  [switch]$UpdateOnly
)

$ErrorActionPreference = "Stop"

$normalizedBaseUrl = $BaseUrl.Trim().TrimEnd('/')
if ($normalizedBaseUrl -notin @('https://app.nodaltrading.com', 'https://nodal-app-preview.vercel.app')) {
  throw "La direccion debe ser un dominio HTTPS oficial de NODAL, sin rutas ni parametros."
}
if (Get-Process -Name NinjaTrader -ErrorAction SilentlyContinue) {
  throw "Cerra NinjaTrader antes de instalar o actualizar. Esto protege la configuracion y la cola pendiente."
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

$connectorSourceText = Get-Content -LiteralPath $connectorSourcePath -Raw
$connectorVersionMatch = [regex]::Match($connectorSourceText, 'ConnectorVersion\s*=\s*"(?<version>[0-9A-Za-z._-]+)"')
if (!$connectorVersionMatch.Success) {
  throw "No se pudo identificar la version del conector incluido."
}
$connectorSourceVersion = $connectorVersionMatch.Groups['version'].Value

function Write-ConfigAtomic {
  param([string]$ConfigPath, [string[]]$Lines)
  $temporaryConfigPath = $ConfigPath + '.tmp.' + [Guid]::NewGuid().ToString('N')
  $bytes = [System.Text.UTF8Encoding]::new($false).GetBytes(($Lines -join [Environment]::NewLine) + [Environment]::NewLine)
  $stream = [System.IO.FileStream]::new($temporaryConfigPath, [System.IO.FileMode]::CreateNew)
  try { $stream.Write($bytes, 0, $bytes.Length); $stream.Flush($true) } finally { $stream.Dispose() }
  if (Test-Path -LiteralPath $ConfigPath) {
    [System.IO.File]::Replace($temporaryConfigPath, $ConfigPath, $ConfigPath + '.atomic.bak')
  } else { [System.IO.File]::Move($temporaryConfigPath, $ConfigPath) }
}

function Set-InstalledSourceVersion {
  param([string]$ConfigPath, [string]$Version)

  $configurationLines = if (Test-Path -LiteralPath $ConfigPath) {
    @(Get-Content -LiteralPath $ConfigPath | Where-Object { $_ -notmatch '^InstalledSourceVersion=' })
  } else {
    @()
  }
  Write-ConfigAtomic -ConfigPath $ConfigPath -Lines ($configurationLines + "InstalledSourceVersion=$Version")
}

function Clear-PendingPairingCode {
  param([string]$ConfigPath)

  # ENTER in UpdateOnly means no new destination. An old, rejected code must
  # not interrupt the existing authenticated connector on every heartbeat.
  Write-ConfigAtomic -ConfigPath $ConfigPath -Lines (@(Get-Content -LiteralPath $ConfigPath | Where-Object { $_ -notmatch '^PairingCode=' }) + 'PairingCode=')
}

function Protect-ConnectorSecret {
  param([string]$Value)

  if ([string]::IsNullOrEmpty($Value)) { return "" }
  Add-Type -AssemblyName System.Security
  $plainBytes = [System.Text.Encoding]::UTF8.GetBytes($Value)
  $entropyBytes = [System.Text.Encoding]::UTF8.GetBytes("NODAL-Ninja-Connector-v0.2")
  $protectedBytes = [System.Security.Cryptography.ProtectedData]::Protect(
    $plainBytes,
    $entropyBytes,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  return [Convert]::ToBase64String($protectedBytes)
}

function Confirm-FirstPairing {
  param([string]$Code, [string]$Version)

  $payload = @{ code = $Code; connectorVersion = $Version } | ConvertTo-Json -Compress
  try {
    $session = Invoke-RestMethod `
      -Uri ($normalizedBaseUrl + "/api/integrations/ninjatrader/pair") `
      -Method Post `
      -ContentType "application/json; charset=utf-8" `
      -Body $payload `
      -TimeoutSec 20
  } catch {
    $statusCode = $null
    if ($_.Exception.Response) {
      try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { $statusCode = $null }
    }
    if ($statusCode -eq 401) {
      throw "El codigo vencio o ya fue utilizado. Genera uno nuevo en NODAL y ejecuta nuevamente INSTALAR-NODAL."
    }
    throw "NODAL no pudo confirmar la vinculacion. Revisa Internet y volve a ejecutar INSTALAR-NODAL; no se consumio una instalacion como valida."
  }

  $connectorId = [string]$session.connectorId
  $accessToken = [string]$session.accessToken
  $refreshToken = [string]$session.refreshToken
  $accessExpiresAt = [string]$session.accessExpiresAt
  $refreshExpiresAt = [string]$session.refreshExpiresAt
  $parsedAccessExpiration = [DateTime]::MinValue
  $parsedRefreshExpiration = [DateTime]::MinValue
  $validAccessExpiration = [DateTime]::TryParse($accessExpiresAt, [ref]$parsedAccessExpiration)
  $validRefreshExpiration = [DateTime]::TryParse($refreshExpiresAt, [ref]$parsedRefreshExpiration)
  if ($connectorId -notmatch '^[0-9a-fA-F-]{36}$' -or
      [string]::IsNullOrWhiteSpace($accessToken) -or
      [string]::IsNullOrWhiteSpace($refreshToken) -or
      !$validAccessExpiration -or
      !$validRefreshExpiration) {
    throw "NODAL respondio sin una credencial completa. Ejecuta nuevamente INSTALAR-NODAL con un codigo nuevo."
  }

  return @{
    ConnectorId = $connectorId
    AccessTokenProtected = Protect-ConnectorSecret -Value $accessToken
    AccessExpiresAtUtc = $parsedAccessExpiration.ToUniversalTime().ToString("O")
    RefreshTokenProtected = Protect-ConnectorSecret -Value $refreshToken
    RefreshExpiresAtUtc = $parsedRefreshExpiration.ToUniversalTime().ToString("O")
  }
}

if ($UpdateOnly) {
  if (!(Test-Path -LiteralPath $connectorConfigPath) -or !(Test-Path -LiteralPath $installedConnectorPath)) {
    throw "No se encontro una instalacion existente. Usa INSTALAR-NODAL para la primera vinculacion."
  }
  $existingOrigin = @(Get-Content -LiteralPath $connectorConfigPath | Where-Object { $_ -match '^BaseUrl=' }) | Select-Object -Last 1
  if (!$existingOrigin -or $existingOrigin.Substring(8).Trim().TrimEnd('/') -notin @('https://app.nodaltrading.com', 'https://nodal-app-preview.vercel.app')) {
    throw "La configuracion existente apunta a un destino no autorizado. Contacta soporte antes de actualizar; no se modifico la instalacion."
  }

  New-Item -ItemType Directory -Force -Path $connectorDirectory | Out-Null
  # Back up source outside AddOns to avoid compiling a duplicate class.
  $backupSource = Join-Path $connectorDirectory ("connector-source-" + [Guid]::NewGuid().ToString("N") + ".bak")
  Copy-Item -LiteralPath $installedConnectorPath -Destination $backupSource
  Copy-Item -LiteralPath $connectorConfigPath -Destination ($connectorConfigPath + ".before-update.bak") -Force
  Copy-Item -LiteralPath $connectorSourcePath -Destination $installedConnectorPath -Force
  Set-InstalledSourceVersion -ConfigPath $connectorConfigPath -Version $connectorSourceVersion

  if ([string]::IsNullOrWhiteSpace($PairingCode)) {
    Write-Output "Codigo del conector actualizado a v$connectorSourceVersion. Tus vinculos, historial y cola de datos se conservaron."
    $PairingCode = Read-Host "Para agregar otro vinculo, pega su codigo. Si solo querias actualizar, presiona ENTER"
  }

  if ([string]::IsNullOrWhiteSpace($PairingCode)) {
    Clear-PendingPairingCode -ConfigPath $connectorConfigPath
    Write-Output "Se descarto un codigo adicional pendiente. La sesion y los vinculos existentes se conservaron."
    Write-Output "La app detectara el codigo v$connectorSourceVersion cuando el conector vuelva a enviar señal. Compila NodalNinjaConnector y reinicia NinjaTrader para activarlo."
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
$existingLines = @()
if (Test-Path -LiteralPath $connectorConfigPath) {
  Copy-Item -LiteralPath $connectorConfigPath -Destination ($connectorConfigPath + ".before-pairing.bak") -Force
  $existingLines = Get-Content -LiteralPath $connectorConfigPath
  # INSTALAR inicia un ciclo de vinculación nuevo. Conserva cola, respaldos y
  # preferencias, pero no una sesión técnica que pudo haber sido revocada.
  # ACTUALIZAR con código conserva la sesión porque agrega otro destino.
  $replacedKeys = if ($UpdateOnly) {
    '^(BaseUrl|PairingCode|InstalledSourceVersion)='
  } else {
    '^(BaseUrl|PairingCode|InstalledSourceVersion|ConnectorId|AccessTokenProtected|AccessExpiresAtUtc|RefreshTokenProtected|RefreshExpiresAtUtc)='
  }
}

Copy-Item -LiteralPath $connectorSourcePath -Destination $installedConnectorPath -Force

if ($UpdateOnly) {
  $keptLines = @($existingLines | Where-Object { $_ -notmatch $replacedKeys })
  Write-ConfigAtomic -ConfigPath $connectorConfigPath -Lines (@(
    "BaseUrl=$normalizedBaseUrl"
    "PairingCode=$normalizedCode"
    "InstalledSourceVersion=$connectorSourceVersion"
  ) + $keptLines)
  Write-Output "Conector actualizado y nuevo vinculo preparado. Los vinculos anteriores y el historial se conservaron."
  Write-Output "Ahora compila NodalNinjaConnector v$connectorSourceVersion en NinjaTrader; el codigo adicional se canjeara una sola vez."
} else {
  $session = Confirm-FirstPairing -Code $normalizedCode -Version $connectorSourceVersion
  $replacedKeys = '^(BaseUrl|PairingCode|InstalledSourceVersion|ConnectorId|AccessTokenProtected|AccessExpiresAtUtc|RefreshTokenProtected|RefreshExpiresAtUtc)='
  $keptLines = @($existingLines | Where-Object { $_ -notmatch $replacedKeys })
  Write-ConfigAtomic -ConfigPath $connectorConfigPath -Lines (@(
    "BaseUrl=$normalizedBaseUrl"
    "PairingCode="
    "InstalledSourceVersion=$connectorSourceVersion"
    "ConnectorId=$($session.ConnectorId)"
    "AccessTokenProtected=$($session.AccessTokenProtected)"
    "AccessExpiresAtUtc=$($session.AccessExpiresAtUtc)"
    "RefreshTokenProtected=$($session.RefreshTokenProtected)"
    "RefreshExpiresAtUtc=$($session.RefreshExpiresAtUtc)"
  ) + $keptLines)
  Write-Output "Vinculacion confirmada con NODAL. La app ya reconoce este conector."
  Write-Output "Ahora compila NodalNinjaConnector v$connectorSourceVersion en NinjaTrader y reinicialo para comenzar a leer las cuentas."
}
