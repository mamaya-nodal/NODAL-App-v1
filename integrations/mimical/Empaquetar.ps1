param(
    [string]$DllPath = (Join-Path $PSScriptRoot 'compilacion_local\NodalBots.Mimical.dll'),
    [string]$OutputPath = (Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) 'private\downloads\MIMICAL-NodalBots.zip')
)

$ErrorActionPreference = 'Stop'
$packageDirectory = Join-Path $PSScriptRoot 'package'
$files = [ordered]@{
    'AdditionalReferences.txt' = Join-Path $packageDirectory 'AdditionalReferences.txt'
    'Info.xml' = Join-Path $packageDirectory 'Info.xml'
    'Mimical.cs' = Join-Path $packageDirectory 'Mimical.cs'
    'NodalBots.Mimical.dll' = $DllPath
}

foreach ($sourcePath in $files.Values) {
    if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
        throw "Falta un archivo necesario para empaquetar MIMICAL: $sourcePath"
    }
}

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$absoluteOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path $absoluteOutputPath -Parent
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

$temporaryPath = "$absoluteOutputPath.tmp"
if (Test-Path -LiteralPath $temporaryPath) {
    Remove-Item -LiteralPath $temporaryPath -Force
}

$archive = [System.IO.Compression.ZipFile]::Open(
    $temporaryPath,
    [System.IO.Compression.ZipArchiveMode]::Create
)
try {
    foreach ($entryName in $files.Keys) {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $archive,
            $files[$entryName],
            $entryName,
            [System.IO.Compression.CompressionLevel]::Optimal
        ) | Out-Null
    }
}
finally {
    $archive.Dispose()
}

$backupPath = "$absoluteOutputPath.backup"
if (Test-Path -LiteralPath $absoluteOutputPath) {
    if (Test-Path -LiteralPath $backupPath) {
        Remove-Item -LiteralPath $backupPath -Force
    }
    [System.IO.File]::Replace($temporaryPath, $absoluteOutputPath, $backupPath, $true)
    Remove-Item -LiteralPath $backupPath -Force
}
else {
    [System.IO.File]::Move($temporaryPath, $absoluteOutputPath)
}

Get-Item -LiteralPath $absoluteOutputPath | Select-Object FullName, Length
Get-FileHash -LiteralPath $absoluteOutputPath -Algorithm SHA256
