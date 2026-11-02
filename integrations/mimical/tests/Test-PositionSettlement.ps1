param([string]$AssemblyPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'compilacion_local\personal\NodalBots.Mimical.dll'))
$ErrorActionPreference = 'Stop'
# Invoke the production decision object with a deterministic clock; no accounts,
# window, connection or Submit/Cancel calls are created by this test.
$assembly = [Reflection.Assembly]::LoadFrom((Resolve-Path $AssemblyPath).Path)
$type = $assembly.GetType('NinjaTrader.NinjaScript.AddOns.MimicalPositionCheck', $true)
$method = $type.GetMethod('ShouldBlock')
$start = [DateTime]::Parse('2026-11-02T09:58:15Z').ToUniversalTime()
$script:count = 0
function New-Check { [Activator]::CreateInstance($type) }
function Check($guard, [int]$target, [int]$actual, [bool]$pending, [double]$progress, [double]$time, [bool]$expected, [string]$label) {
    $result = $method.Invoke($guard, @($target, $actual, $pending, $start.AddSeconds($progress), $start.AddSeconds($time)))
    if ($result -ne $expected) { throw "$label : got $result expected $expected" }
    $script:count++
}

# Recorded 06:58 incident: leader partial, follower full, leader Filled before
# Position catches up at 06:58:18.048. Old guard blocked at 06:58:17.739.
$g=New-Check
Check $g -1 0 $true .491 .732 $false 'first partial'
Check $g -1 -2 $true .767 1.750 $false 'follower completed'
Check $g -1 -2 $false 2.021 2.739 $false 'incident must not block'
Check $g -2 -2 $false 3.048 3.100 $false 'positions agree'

# Buy-close-sell cycles, both sides and delayed position updates.
foreach($sign in @(-1,1)) {
    $g=New-Check
    Check $g ($sign*2) 0 $true 0 0 $false 'entry pending'
    Check $g ($sign*2) $sign $true 1 1 $false 'partial follower'
    Check $g ($sign*2) ($sign*2) $false 2 2 $false 'entry settled'
    Check $g 0 ($sign*2) $true 2.1 2.1 $false 'closing'
    Check $g (-$sign) $sign $true 3 3 $false 'opposite entry in flight'
    Check $g (-$sign*2) 0 $false 4 4 $false 'awaiting position callback'
    Check $g (-$sign*2) (-$sign*2) $false 5 5 $false 'opposite entry settled'
}

$g=New-Check
Check $g -1 0 $false 0 0 $false 'mismatch starts'
Check $g -1 -2 $false 0 1.9 $false 'pair change restarts grace'
Check $g -1 -2 $false 0 2.1 $false 'old deadline not reused'
Check $g -1 -2 $false 0 3.9 $true 'stable real mismatch still blocks'

$g=New-Check
Check $g 2 1 $false 0 0 $false 'progress case starts'
Check $g 2 1 $false 1.9 2.1 $false 'fill restarts settlement'
Check $g 2 1 $false 1.9 3.91 $true 'stale position eventually blocks'

$g=New-Check
Check $g 2 0 $true 0 0 $false 'market order pending'
Check $g 2 0 $true 0 3 $false 'pending does not use two second cutoff'
Check $g 2 0 $true 0 15 $true 'stalled order has bounded deadline'

$g=New-Check
for($i=0;$i -lt 15;$i++) { Check $g 2 1 $true $i $i $false 'ongoing partial progress' }
Check $g 2 1 $true 15 15 $false 'active fills may legitimately last more than 15 seconds'
Check $g 2 1 $true 15 30 $true 'stalled partial eventually blocks'
Check $g 2 2 $false 30.1 30.1 $false 'match clears deadline'
Check $g 0 2 $false 31 31 $false 'new cycle has fresh deadline'
Check $g 0 2 $false 31 33 $true 'missing close detected'

Write-Output "PASS: $script:count position settlement checks"
