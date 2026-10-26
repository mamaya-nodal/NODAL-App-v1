param(
    [string]$AssemblyPath = (Join-Path (Split-Path -Parent $PSScriptRoot) 'compilacion_local\NodalBots.Mimical.dll')
)

# Calls the production Transform method on inert objects. No Account connection,
# Submit, Change, Cancel, market-data subscription or window constructor is used.
$ErrorActionPreference = 'Stop'
[void][Reflection.Assembly]::LoadFrom('C:\Program Files\NinjaTrader 8\bin\NinjaTrader.Core.dll')
[void][Reflection.Assembly]::LoadFrom('C:\Program Files\NinjaTrader 8\bin\NinjaTrader.Gui.dll')
$assembly = [Reflection.Assembly]::LoadFrom((Resolve-Path -LiteralPath $AssemblyPath).Path)
$engineType = $assembly.GetType('NinjaTrader.NinjaScript.AddOns.MimicalWindow', $true)
$flags = [Reflection.BindingFlags]'Public,NonPublic,Instance'
$configType = $engineType.GetNestedType('FollowerConfig', [Reflection.BindingFlags]'NonPublic')
$transform = $engineType.GetMethod('Transform', $flags)
$quantity = $engineType.GetMethod('Quantity', [Reflection.BindingFlags]'NonPublic,Static')
$engine = [Runtime.Serialization.FormatterServices]::GetUninitializedObject($engineType)
$account = [Runtime.Serialization.FormatterServices]::GetUninitializedObject([NinjaTrader.Cbi.Account])
$positions = New-Object 'System.Collections.ObjectModel.Collection[NinjaTrader.Cbi.Position]'
[NinjaTrader.Cbi.Account].GetField('<Positions>k__BackingField', $flags).SetValue($account, $positions)
$script:checks = 0
$script:failures = New-Object 'System.Collections.Generic.List[string]'

function Assert-Value($actual, $expected, [string]$label) {
    $script:checks++
    if ($actual -ne $expected) { $script:failures.Add("${label}: expected=$expected actual=$actual") }
}

function Test-Transform([string]$label, [string]$action, [string]$orderType, [decimal]$ratio,
    [double]$limit, [double]$stop, [string]$expectedAction, [string]$expectedType,
    [double]$expectedLimit, [double]$expectedStop) {
    $order = [Runtime.Serialization.FormatterServices]::GetUninitializedObject([NinjaTrader.Cbi.Order])
    [NinjaTrader.Cbi.Order].GetField('<OrderAction>k__BackingField', $flags).SetValue($order, [Enum]::Parse([NinjaTrader.Cbi.OrderAction], $action))
    [NinjaTrader.Cbi.Order].GetField('<OrderType>k__BackingField', $flags).SetValue($order, [Enum]::Parse([NinjaTrader.Cbi.OrderType], $orderType))
    $follower = [Activator]::CreateInstance($configType, $true)
    $configType.GetField('Ratio', $flags).SetValue($follower, $ratio)
    $configType.GetField('Account', $flags).SetValue($follower, $account)
    [object[]]$arguments = @($order, $follower, $limit, $stop, [NinjaTrader.Cbi.OrderAction]::Buy, [NinjaTrader.Cbi.OrderType]::Market, 0.0, 0.0)
    try { [void]$transform.Invoke($engine, $arguments) }
    catch {
        $script:checks++
        $script:failures.Add($label + ': ' + $_.Exception.GetBaseException().Message)
        return
    }
    Assert-Value $arguments[4].ToString() $expectedAction ($label + ' action')
    Assert-Value $arguments[5].ToString() $expectedType ($label + ' type')
    Assert-Value $arguments[6] $expectedLimit ($label + ' limit')
    Assert-Value $arguments[7] $expectedStop ($label + ' stop')
}

# The four real failures reported on 2026-10-26, plus the symmetric sell cases.
$stops = @(29541.5, 29550.0, 29554.5, 29544.0)
foreach ($stop in $stops) {
    Test-Transform "Incident Buy StopLimit $stop" 'Buy' 'StopLimit' -1 ($stop + 0.25) $stop 'SellShort' 'Limit' $stop 0
    Test-Transform "Sell StopLimit $stop" 'Sell' 'StopLimit' -1 ($stop - 0.25) $stop 'Buy' 'Limit' $stop 0
}

# Same-side followers retain BOTH prices. Negative followers always anchor their
# inverse Limit at the stop trigger, not at the execution allowance/offset.
foreach ($ratio in @([decimal]1, [decimal]2, [decimal]'0.34', [decimal]-1, [decimal]-2, [decimal]'-0.34')) {
    foreach ($offset in @(0.0, 0.25, 1.0, 2.5, -0.25)) {
        foreach ($action in @('Buy', 'Sell')) {
            $stop = 30000.0
            $limit = if ($action -eq 'Buy') { $stop + $offset } else { $stop - $offset }
            $inverse = $ratio -lt 0
            $expectedAction = if (-not $inverse) { $action } elseif ($action -eq 'Buy') { 'SellShort' } else { 'Buy' }
            $expectedType = if ($inverse) { 'Limit' } else { 'StopLimit' }
            $expectedLimit = if ($inverse) { $stop } else { $limit }
            $expectedStop = if ($inverse) { 0.0 } else { $stop }
            Test-Transform "StopLimit $action ratio=$ratio offset=$offset" $action 'StopLimit' $ratio $limit $stop $expectedAction $expectedType $expectedLimit $expectedStop
        }
    }
}

# Leader price amendments use this same method in ChangeLinks; the trigger must
# move the follower price while an offset-only amendment must not shift it.
Test-Transform 'Buy amendment' 'Buy' 'StopLimit' -1 30010.25 30010 'SellShort' 'Limit' 30010 0
Test-Transform 'Buy offset-only amendment' 'Buy' 'StopLimit' -1 30012 30010 'SellShort' 'Limit' 30010 0
Test-Transform 'Sell amendment' 'Sell' 'StopLimit' -1 29989.75 29990 'Buy' 'Limit' 29990 0
Test-Transform 'Sell offset-only amendment' 'Sell' 'StopLimit' -1 29988 29990 'Buy' 'Limit' 29990 0
Test-Transform 'Buy Limit unchanged' 'Buy' 'Limit' -1 29900 0 'SellShort' 'StopMarket' 0 29900
Test-Transform 'Sell Limit unchanged' 'Sell' 'Limit' -1 30100 0 'Buy' 'StopMarket' 0 30100
Test-Transform 'Buy StopMarket unchanged' 'Buy' 'StopMarket' -1 0 30100 'SellShort' 'Limit' 30100 0
Test-Transform 'Sell StopMarket unchanged' 'Sell' 'StopMarket' -1 0 29900 'Buy' 'Limit' 29900 0
Test-Transform 'Buy Market unchanged' 'Buy' 'Market' -1 0 0 'SellShort' 'Market' 0 0
Test-Transform 'Sell Market unchanged' 'Sell' 'Market' -1 0 0 'Buy' 'Market' 0 0
Test-Transform 'ATM short stop exit' 'BuyToCover' 'StopLimit' -1 30100.25 30100 'SellShort' 'Limit' 30100 0
Test-Transform 'ATM long stop exit' 'Sell' 'StopLimit' -1 29899.75 29900 'Buy' 'Limit' 29900 0

# Cross Order uses the same price transform and a different instrument. Exercise
# the actual production instrument-name and quantity functions as well.
$cross = $engineType.GetMethod('CrossOrderInstrumentName', [Reflection.BindingFlags]'NonPublic,Static')
Assert-Value ($cross.Invoke($null, @('NQ DEC26'))) 'MNQ DEC26' 'Cross Order NQ to MNQ'
Assert-Value ($quantity.Invoke($null, @([int]3, [decimal]-1))) 3 'Negative quantity magnitude'
Assert-Value ($quantity.Invoke($null, @([int]3, [decimal]'-0.34'))) 1 'Decimal negative ratio'
Assert-Value ($quantity.Invoke($null, @([int]3, [decimal]'-0.1'))) 0 'Small ratio remains omitted'

if ($script:failures.Count) {
    $script:failures | Write-Output
    throw "StopLimit regression: $($script:failures.Count) failures out of $($script:checks) checks."
}
"STOPLIMIT: $($script:checks) checks passed; four reported failures replayed; no orders submitted."
