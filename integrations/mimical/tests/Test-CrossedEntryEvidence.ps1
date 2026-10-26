param([string]$LogPath = (Join-Path $PSScriptRoot '../checkpoints/20261021_crossed_limit/crossed_limit_sim_evidence.tsv'))
$ErrorActionPreference = 'Stop'
$rows = @(Import-Csv -LiteralPath $LogPath -Delimiter "`t" -Encoding UTF8)
$recoveries = @($rows | Where-Object event -eq 'INVERSE_ENTRY_RECOVERY')
if ($recoveries.Count -ne 2) { throw 'Se esperaban las dos pruebas de entrada cruzada.' }
foreach ($recovery in $recoveries) {
    $leaderId = ($recovery.detail -split '=')[-1]
    $cancel = @($rows | Where-Object { $_.event -eq 'ORDER' -and $_.order -eq $recovery.order -and $_.state -eq 'Cancelled' })
    if ($cancel.Count -ne 1) { throw 'Falta cancelación confirmada del stop original.' }
    $submits = @($rows | Where-Object { $_.event -eq 'INVERSE_ENTRY_MARKET_SUBMIT' -and $_.action -eq $recovery.action })
    if (($submits | Measure-Object quantity -Sum).Sum -ne 3) { throw 'Cantidad de cobertura incorrecta.' }
    foreach ($submit in $submits) {
        if ([datetime]$submit.utc -lt [datetime]$cancel[0].utc) { throw 'Reemplazo antes de confirmar cancelación.' }
        $leaderFills = @($rows | Where-Object { $_.event -eq 'ORDER' -and $_.order -eq $leaderId -and [int]$_.filled -gt 0 -and [datetime]$_.utc -le [datetime]$submit.utc })
        if ($leaderFills.Count -eq 0) { throw 'Reemplazo sin ejecución previa de líder.' }
        $terminal = @($rows | Where-Object { $_.event -eq 'ORDER' -and $_.order -eq $submit.order })[-1]
        if ($terminal.state -ne 'Filled' -or [int]$terminal.filled -ne [int]$submit.quantity) { throw 'Cobertura incompleta.' }
    }
}
$errors = @($rows | Where-Object { $_.event -match 'TRIP|ERROR' -or ($_.event -eq 'ORDER' -and ($_.state -eq 'Rejected' -or $_.detail -notlike 'NoError*')) })
if ($errors.Count) { throw 'Se registraron errores o rechazos.' }
if (@($rows | Where-Object event -eq 'TRAILING_DEACTIVATED_RESTORED').Count -ne 2) { throw 'Faltan restauraciones.' }
$lastOrders = $rows | Where-Object event -eq 'ORDER' | Group-Object account,order | ForEach-Object { $_.Group[-1] }
if (@($lastOrders | Where-Object state -NotIn @('Filled','Cancelled','Rejected')).Count) { throw 'Quedaron órdenes no terminales.' }
$lastPositions = @($rows | Where-Object event -eq 'POSITION' | Group-Object account | ForEach-Object { $_.Group[-1] })
if ($lastPositions.Count -ne 3 -or @($lastPositions | Where-Object { $_.state -ne 'Flat' -or [int]$_.quantity -ne 0 }).Count) { throw 'El grupo no quedó cerrado.' }
'EVIDENCIA SIM APROBADA: compra y venta cruzadas, cancelación confirmada antes del reemplazo, 3 contratos inversos por entrada, dos restauraciones y cero residuos.'
