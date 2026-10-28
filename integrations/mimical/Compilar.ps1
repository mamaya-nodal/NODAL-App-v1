param(
    [string]$NinjaBin = 'C:\Program Files\NinjaTrader 8\bin',
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'compilacion_local'),
    [ValidateSet('personal', 'identity')]
    [string]$Scope = 'personal'
)
$ErrorActionPreference = 'Stop'
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$compiler = Join-Path $framework 'csc.exe'
foreach ($required in @($compiler, (Join-Path $NinjaBin 'NinjaTrader.Core.dll'), (Join-Path $NinjaBin 'NinjaTrader.Gui.dll'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Falta una dependencia local: $required" }
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$scopeOutput = Join-Path $OutputDirectory $Scope
New-Item -ItemType Directory -Path $scopeOutput -Force | Out-Null
$output = Join-Path $scopeOutput 'NodalBots.Mimical.dll'
$define = if ($Scope -eq 'identity') { '/define:MIMICAL_IDENTITY' } else { $null }
$arguments = @('/nologo', '/target:library', "/out:$output")
if ($define) { $arguments += $define }
$arguments += @(
    "/reference:$NinjaBin\NinjaTrader.Core.dll"
    "/reference:$NinjaBin\NinjaTrader.Gui.dll"
    "/reference:$framework\WPF\WindowsBase.dll"
    "/reference:$framework\WPF\PresentationCore.dll"
    "/reference:$framework\WPF\PresentationFramework.dll"
    "/reference:$framework\System.Xaml.dll"
    "/reference:$framework\System.Runtime.Serialization.dll"
    "/reference:$framework\System.Security.dll"
    (Join-Path $PSScriptRoot 'src\Mimical.cs')
    (Join-Path $PSScriptRoot 'src\MimicalLicense.cs')
    (Join-Path $PSScriptRoot 'src\Mimical.AssemblyInfo.cs')
)
& $compiler @arguments
if ($LASTEXITCODE -ne 0) { throw 'La compilación aislada de MIMICAL falló.' }
Get-Item -LiteralPath $output | Select-Object FullName,Length,@{Name='FileVersion';Expression={$_.VersionInfo.FileVersion}}
Get-FileHash -LiteralPath $output -Algorithm SHA256
