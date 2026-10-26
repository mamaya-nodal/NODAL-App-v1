$ErrorActionPreference = 'Stop'
[void][Reflection.Assembly]::LoadFrom('C:\Program Files\NinjaTrader 8\bin\NinjaTrader.Core.dll')
$assembly = [Reflection.Assembly]::LoadFrom((Join-Path $env:TEMP 'NodalBots.Mimical.V1.Test.dll'))
$type = $assembly.GetType('NinjaTrader.NinjaScript.AddOns.MimicalEntryRecovery', $true)
$script:count = 0
function New-Plan { [Activator]::CreateInstance($type) }
function Check($actual, $expected, $label) {
    if ($actual -ne $expected) { throw "$label : esperado=$expected obtenido=$actual" }
    $script:count++
}

# Leader fills while the old stop is still cancelling: never send a second order yet.
$p = New-Plan
$p.ObserveLeader(3)
$p.ObserveOriginal(0, $false)
Check ($p.ReserveNext(-1)) 0 'CancelPending no habilita reemplazo'
$p.ObserveOriginal(0, $true)
Check ($p.ReserveNext(-1)) 3 'Cancelación confirmada permite cubrir tres'
Check ($p.ReserveNext(-1)) 0 'Evento duplicado no duplica contratos'

# Cancellation wins the race, before the leader executes.
$p = New-Plan
$p.ObserveOriginal(0, $true)
Check ($p.ReserveNext(-1)) 0 'Sin fill líder no abre cobertura'
$p.ObserveLeader(1)
Check ($p.ReserveNext(-1)) 1 'Primer parcial'
$p.ObserveLeader(3)
Check ($p.ReserveNext(-1)) 2 'Segundo parcial sólo completa el faltante'
$p.ObserveLeader(1)
Check ($p.ReserveNext(-1)) 0 'Evento atrasado no altera reserva'

# The old stop fills partly or entirely while being cancelled.
foreach ($filled in 0..3) {
    $p = New-Plan
    $p.ObserveLeader(3)
    $p.ObserveOriginal($filled, $false)
    Check ($p.ReserveNext(-1)) 0 "Espera terminal con $filled fills"
    $p.ObserveOriginal($filled, $true)
    Check ($p.ReserveNext(-1)) (3-$filled) "Descuenta $filled fills originales"
    Check ($p.ReserveNext(-1)) 0 'Repetición idempotente'
}

# Preserve the existing truncated ratio calculation, including cumulative partials.
$p = New-Plan
$p.ObserveOriginal(0, $true)
$p.ObserveLeader(2)
Check ($p.ReserveNext([decimal]'-0.34')) 0 'Parcial insuficiente para un contrato'
$p.ObserveLeader(3)
Check ($p.ReserveNext([decimal]'-0.34')) 1 'Tres a ratio -0.34 producen uno'
$p = New-Plan
$p.ObserveOriginal(1, $true)
$p.ObserveLeader(3)
Check ($p.ReserveNext([decimal]'-0.34')) 0 'Ratio considera fill original'
$p = New-Plan
$p.ObserveOriginal(0, $true)
$p.ObserveLeader(3)
Check ($p.ReserveNext([decimal]'-2')) 6 'Ratio -2'

$p = New-Plan
$p.ObserveOriginal(0, $true)
$p.Suppressed = $true
$p.ObserveLeader(3)
Check ($p.ReserveNext(-1)) 0 'Cierre líder impide reapertura tardía'

$crossed = $type.GetMethod('StopIsCrossed')
function Cross($buy, $stop, $last, $bid, $ask) {
    $crossed.Invoke($null, @([bool]$buy, [double]$stop, [double]$last, [double]$bid, [double]$ask))
}
Check (Cross $false 29975.75 29962.25 29962 29962.5) $true 'Reproducción del rechazo SellShort'
Check (Cross $true 29948 29962.25 29962 29962.5) $true 'Caso simétrico Buy'
Check (Cross $false 29948 29962.25 29962 29962.5) $false 'Stop venta pendiente válido'
Check (Cross $true 29975.75 29962.25 29962 29962.5) $false 'Stop compra pendiente válido'
Check (Cross $false 29962 29962.25 29962 29962.5) $true 'Borde bid'
Check (Cross $true 29962.5 29962.25 29962 29962.5) $true 'Borde ask'
Check (Cross $false 29948 0 0 0) $false 'No inventa cotización ausente'
"Entrada inversa: $script:count comprobaciones aprobadas."
