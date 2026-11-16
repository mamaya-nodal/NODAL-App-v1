$ErrorActionPreference='Stop'
$base=Split-Path -Parent $PSScriptRoot
$assembly=[Reflection.Assembly]::LoadFrom((Join-Path $base 'compilacion_local\personal\NodalBots.Mimical.dll'))
$type=$assembly.GetType('NinjaTrader.NinjaScript.AddOns.MimicalOrderCycles',$true)
$ledger=[Activator]::CreateInstance($type)
$script:checks=0
function Check($value,$name){if(!$value){throw $name};$script:checks++}
foreach($sign in @(-1,1)) {
    $ledger.Reset()
    $ledger.Observe('entry','leader',$sign,4,$true)
    $ledger.Observe('hedge','broker',(-$sign),5,$true)
    $ledger.Observe('close','leader',(-$sign),4,$true)
    $ledger.Observe('nextPending','leader',$sign,0,$false)
    Check ($ledger.IsCurrent('entry')) 'Broker still open: do not retire cycle'
    $ledger.Observe('brokerClose','broker',$sign,5,$true)
    Check ($ledger.IsCurrent('entry')) 'Pending order prevents retirement'
    $ledger.Observe('nextPending','leader',$sign,0,$true)
    $ledger.Observe('next','leader',(-$sign),4,$true)
    Check (!$ledger.IsCurrent('entry')) 'New entry must retire historical links without a timer'
    Check ($ledger.IsCurrent('next')) 'New entry is current'
    $ledger.Observe('entry','leader',$sign,4,$true)
    Check ($ledger.IsCurrent('next')) 'Duplicate callback does not change cycle'
    $ledger.Observe('nextPending','leader',$sign,1,$true)
    Check (!$ledger.IsCurrent('next')) 'Late new fill disables exemption'
}
$ledger.Reset()
$ledger.Observe('e','leader',1,4,$true)
$ledger.Observe('s','leader',-1,3,$false)
$ledger.Observe('other','broker',1,0,$false)
Check ($ledger.IsCurrent('e')) 'Partial stop must keep entry in same cycle'
$ledger.Observe('s','leader',-1,4,$true)
$ledger.Observe('other','broker',1,0,$true)
$ledger.Observe('new','leader',1,0,$false)
Check (!$ledger.IsCurrent('e')) 'Complete partial exit and cancellation release cycle'

# Replay the actual Order callbacks in original file order, including unlinked
# manual closes. No timestamps or order IDs are hardcoded as a cycle boundary.
$ledger.Reset()
$rows=@(Import-Csv (Join-Path $base 'tests\fixtures\multicycle-sim.tsv') -Delimiter "`t")
foreach($row in $rows | Where-Object event -eq 'ORDER') {
    $sign=if($row.action -in @('Buy','BuyToCover')){1}else{-1}
    $ledger.Observe([string]$row.order,($row.account+'|'+$row.instrument),$sign,[int]$row.filled,($row.state -in @('Filled','Cancelled','Rejected')))
}
$pairType=$assembly.GetType('NinjaTrader.NinjaScript.AddOns.MimicalExitFillPair',$true)
$method=$assembly.GetType('NinjaTrader.NinjaScript.AddOns.MimicalExitSettlement',$true).GetMethod('Explains')
$pairs=@();$retired=0
foreach($link in $rows | Where-Object {$_.event -eq 'SUBMIT_COPY' -and $_.account -eq 'Simbroker'}) {
    $leaderId=([regex]::Match($link.detail,'leader=([^;]+)')).Groups[1].Value
    if(!$ledger.IsCurrent($leaderId)){$retired++;continue}
    Check ($ledger.IsCurrent([string]$link.order)) 'Current linked follower must belong to same cycle'
    $l=@($rows | Where-Object {$_.event -eq 'ORDER' -and $_.order -eq $leaderId})[-1]
    $f=@($rows | Where-Object {$_.event -eq 'ORDER' -and $_.order -eq $link.order})[-1]
    $p=[Activator]::CreateInstance($pairType)
    $p.IsExit=$l.type -ne 'Market'
    $p.LeaderSign=if($l.action -in @('Buy','BuyToCover')){1}else{-1}
    $p.FollowerSign=if($f.action -in @('Buy','BuyToCover')){1}else{-1}
    $p.LeaderFilled=[int]$l.filled; $p.FollowerFilled=[int]$f.filled
    $p.LeaderQuantity=[int]$l.quantity; $p.FollowerQuantity=[int]$f.quantity
    $p.LeaderWorking=$l.state -in @('Submitted','Accepted','Working','PartFilled')
    $p.FollowerWorking=$f.state -in @('Submitted','Accepted','Working','PartFilled')
    $pairs+=$p
}
Check ($retired -eq 3 -and $pairs.Count -eq 3) 'Actual replay must separate 3 retired links and 3 current links'
$array=[Array]::CreateInstance($pairType,$pairs.Count)
for($i=0;$i -lt $pairs.Count;$i++){$array.SetValue($pairs[$i],$i)}
Check ($method.Invoke($null,@([int]-4,[int]0,[decimal]-1.25,$array))) 'Actual recorded mismatch must now be explained'
Check (!$method.Invoke($null,@([int]-4,[int]1,[decimal]-1.25,$array))) 'Unexplained extra position remains detectable'
"PASS: $script:checks checks, including real multi-cycle replay. No orders sent."
