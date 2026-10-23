param(
  [string]$OutputDirectory = "output"
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$sourcePath = Join-Path $repoRoot "integrations\ninjatrader\NodalNinjaConnector.cs"
$installerPath = Join-Path $repoRoot "integrations\ninjatrader\installer\NodalConnectorPilotInstaller.cs"
$outputRoot = Join-Path $repoRoot $OutputDirectory
$buildRoot = Join-Path $repoRoot "tmp\ninja-pilot-installer-build"
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$ninjaBin = "C:\Program Files\NinjaTrader 8\bin"
$framework = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319"
$wpf = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\WPF"

foreach ($required in @($sourcePath, $installerPath, $csc, (Join-Path $ninjaBin "NinjaTrader.Core.dll"), (Join-Path $ninjaBin "NinjaTrader.Gui.dll"))) {
  if (!(Test-Path -LiteralPath $required)) { throw "Falta el archivo requerido: $required" }
}

New-Item -ItemType Directory -Force -Path $buildRoot, $outputRoot | Out-Null
$runtimeSourcePath = Join-Path $buildRoot "NodalNinjaConnector.Runtime.cs"
$runtimeDllPath = Join-Path $buildRoot "Nodal.NinjaConnector.dll"
$outputExePath = Join-Path $outputRoot "NODAL-Conector-0.16-Piloto.exe"

$runtimeSource = Get-Content -LiteralPath $sourcePath -Raw
$classBefore = 'public class NodalNinjaConnector : AddOnBase'
$classAfter = 'public class NodalNinjaConnectorV016 : AddOnBase'
$configBefore = 'private const string ConfigFileName = "nodal-ninja-connector.config";'
$configAfter = 'private const string ConfigFileName = "nodal-ninja-connector-v2.config";'
if ([regex]::Matches($runtimeSource, [regex]::Escape($classBefore)).Count -ne 1) { throw "No se encontro exactamente una clase del conector para transformar." }
if ([regex]::Matches($runtimeSource, [regex]::Escape($configBefore)).Count -ne 1) { throw "No se encontro exactamente una configuracion del conector para transformar." }
$runtimeSource = $runtimeSource.Replace($classBefore, $classAfter).Replace($configBefore, $configAfter)
[System.IO.File]::WriteAllText($runtimeSourcePath, $runtimeSource, [System.Text.UTF8Encoding]::new($false))

$runtimeReferences = @(
  (Join-Path $ninjaBin "NinjaTrader.Core.dll"),
  (Join-Path $ninjaBin "NinjaTrader.Gui.dll"),
  (Join-Path $framework "System.dll"),
  (Join-Path $framework "System.Core.dll"),
  (Join-Path $framework "System.Net.Http.dll"),
  (Join-Path $framework "System.Web.Extensions.dll"),
  (Join-Path $wpf "WindowsBase.dll"),
  (Join-Path $wpf "PresentationCore.dll"),
  (Join-Path $wpf "PresentationFramework.dll")
)
$runtimeArgs = @('/nologo', '/target:library', '/platform:x64', "/out:$runtimeDllPath") +
  ($runtimeReferences | ForEach-Object { "/reference:$_" }) + @($runtimeSourcePath)
& $csc @runtimeArgs
if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $runtimeDllPath)) { throw "No se pudo compilar el modulo NinjaTrader." }

$installerReferences = @(
  (Join-Path $framework "System.dll"),
  (Join-Path $framework "System.Core.dll"),
  (Join-Path $framework "System.Drawing.dll"),
  (Join-Path $framework "System.Windows.Forms.dll"),
  (Join-Path $framework "System.Security.dll")
)
$installerArgs = @('/nologo', '/target:winexe', '/platform:anycpu', "/out:$outputExePath", "/resource:$runtimeDllPath,Nodal.NinjaConnector.dll") +
  ($installerReferences | ForEach-Object { "/reference:$_" }) + @($installerPath)
& $csc @installerArgs
if ($LASTEXITCODE -ne 0 -or !(Test-Path -LiteralPath $outputExePath)) { throw "No se pudo compilar el instalador piloto." }

$hash = (Get-FileHash -LiteralPath $outputExePath -Algorithm SHA256).Hash
$runtimeHash = (Get-FileHash -LiteralPath $runtimeDllPath -Algorithm SHA256).Hash
Write-Output "INSTALLER=$outputExePath"
Write-Output "INSTALLER_SHA256=$hash"
Write-Output "RUNTIME_SHA256=$runtimeHash"
