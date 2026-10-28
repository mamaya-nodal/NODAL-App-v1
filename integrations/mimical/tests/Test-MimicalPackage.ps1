param(
    [ValidateSet('personal', 'identity')]
    [string]$Scope = 'personal',
    [string]$ArchivePath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$repositoryRoot = (Split-Path $PSScriptRoot -Parent | Split-Path -Parent | Split-Path -Parent)
if ([string]::IsNullOrWhiteSpace($ArchivePath)) {
    $archiveName = if ($Scope -eq 'identity') { 'MIMICAL-NodalBots-Identity.zip' } else { 'MIMICAL-NodalBots.zip' }
    $ArchivePath = Join-Path $repositoryRoot "private\downloads\$archiveName"
}

function Assert-True([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

$expectedEntries = @(
    'AdditionalReferences.txt',
    'Info.xml',
    'Mimical.cs',
    'NodalBots.Mimical.dll'
)

$absoluteArchivePath = [System.IO.Path]::GetFullPath($ArchivePath)
Assert-True (Test-Path -LiteralPath $absoluteArchivePath -PathType Leaf) "No existe el ZIP de MIMICAL: $absoluteArchivePath"

$archive = [System.IO.Compression.ZipFile]::OpenRead($absoluteArchivePath)
try {
    $entryNames = @($archive.Entries | ForEach-Object { $_.FullName })
    Assert-True ($entryNames.Count -eq $expectedEntries.Count) 'El ZIP no contiene exactamente los cuatro archivos esperados.'

    foreach ($entryName in $expectedEntries) {
        Assert-True ($entryNames -contains $entryName) "Falta $entryName en la raíz del ZIP."
    }
    Assert-True (-not ($entryNames | Where-Object { $_ -match '[/\\]' })) 'El ZIP contiene una carpeta intermedia; NinjaTrader exige Info.xml en la raíz.'

    $infoEntry = $archive.GetEntry('Info.xml')
    $infoReader = New-Object System.IO.StreamReader($infoEntry.Open())
    try { [xml]$info = $infoReader.ReadToEnd() } finally { $infoReader.Dispose() }
    Assert-True ($info.NinjaTrader.Export.Version -eq '8.1.6.3') 'Info.xml no declara la versión esperada de NinjaTrader.'

    $referencesEntry = $archive.GetEntry('AdditionalReferences.txt')
    $referencesReader = New-Object System.IO.StreamReader($referencesEntry.Open())
    try { $references = $referencesReader.ReadToEnd() } finally { $referencesReader.Dispose() }
    Assert-True ($references -match 'NodalBots\.Mimical\.dll') 'AdditionalReferences.txt no referencia la DLL de MIMICAL.'

    $dllEntry = $archive.GetEntry('NodalBots.Mimical.dll')
    Assert-True ($dllEntry.Length -gt 0) 'La DLL de MIMICAL está vacía.'
    $dllStream = $dllEntry.Open()
    try {
        $firstByte = $dllStream.ReadByte()
        $secondByte = $dllStream.ReadByte()
    }
    finally {
        $dllStream.Dispose()
    }
    Assert-True ($firstByte -eq 0x4D -and $secondByte -eq 0x5A) 'La DLL no tiene una cabecera PE válida.'
}
finally {
    $archive.Dispose()
}

Write-Output "OK: paquete MIMICAL $Scope importable; Info.xml y los cuatro archivos están en la raíz."
Get-FileHash -LiteralPath $absoluteArchivePath -Algorithm SHA256
