$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$sourcePath = Join-Path $repoRoot 'integrations/ninjatrader/NodalNinjaConnector.cs'
$source = [IO.File]::ReadAllText($sourcePath)
# Compile the exact transport helper from the candidate source, not a copy.
$start = $source.IndexOf('internal sealed class NodalReliableTelemetry')
$end = $source.IndexOf('public class NodalNinjaConnector : AddOnBase')
if ($start -lt 0 -or $end -le $start) { throw 'Helper not found' }
$imports = @'
using System;
using System.IO;
using System.Linq;
using System.Text;
using System.Globalization;
using System.Collections.Generic;
using System.Threading;
using System.Security.Cryptography;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Web.Script.Serialization;
'@
$helper = $imports + "`nnamespace NinjaTrader.NinjaScript.AddOns {`n" + $source.Substring($start, $end - $start) + "`n}"
$harness = [IO.File]::ReadAllText((Join-Path $repoRoot 'integrations/ninjatrader/tests/TransportTests.cs'))
Add-Type -TypeDefinition ($harness + "`nnamespace IsolatedHelper { }`n" + $helper.Replace($imports, '')) -ReferencedAssemblies System.Core,System.Web.Extensions,System.Security
$testDirectory = Join-Path $repoRoot ('tmp/ninja-transport-' + [Guid]::NewGuid().ToString('N'))
[NodalTransportTests]::Run($testDirectory)
# Retain fixtures for inspection. Never reads or changes a real Ninja queue.
Write-Output "Fixtures: $testDirectory"
$tokens = $null; $parseErrors = $null
[Management.Automation.Language.Parser]::ParseFile((Join-Path $repoRoot 'integrations/ninjatrader/NODAL-Ninja-Connector-setup.ps1'), [ref]$tokens, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count -gt 0) { throw ($parseErrors | Out-String) }
Write-Output 'PASS: installer syntax'
