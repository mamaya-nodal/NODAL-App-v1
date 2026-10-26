param(
    [string]$NinjaBin = 'C:\Program Files\NinjaTrader 8\bin',
    [string]$OutputDirectory = (Join-Path $PSScriptRoot 'compilacion_local')
)
$ErrorActionPreference = 'Stop'
$framework = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319'
$compiler = Join-Path $framework 'csc.exe'
foreach ($required in @($compiler, (Join-Path $NinjaBin 'NinjaTrader.Core.dll'), (Join-Path $NinjaBin 'NinjaTrader.Gui.dll'))) {
    if (-not (Test-Path -LiteralPath $required)) { throw "Falta una dependencia local: $required" }
}
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$output = Join-Path $OutputDirectory 'NodalBots.Mimical.dll'
& $compiler /nologo /target:library "/out:$output" `
    "/reference:$NinjaBin\NinjaTrader.Core.dll" `
    "/reference:$NinjaBin\NinjaTrader.Gui.dll" `
    "/reference:$framework\WPF\WindowsBase.dll" `
    "/reference:$framework\WPF\PresentationCore.dll" `
    "/reference:$framework\WPF\PresentationFramework.dll" `
    "/reference:$framework\System.Xaml.dll" `
    "/reference:$framework\System.Runtime.Serialization.dll" `
    "/reference:$framework\System.Security.dll" `
    (Join-Path $PSScriptRoot 'src\Mimical.cs') `
    (Join-Path $PSScriptRoot 'src\MimicalLicense.cs') `
    (Join-Path $PSScriptRoot 'src\Mimical.AssemblyInfo.cs')
if ($LASTEXITCODE -ne 0) { throw 'La compilación aislada de MIMICAL falló.' }
Get-Item -LiteralPath $output | Select-Object FullName,Length,@{Name='FileVersion';Expression={$_.VersionInfo.FileVersion}}
Get-FileHash -LiteralPath $output -Algorithm SHA256
