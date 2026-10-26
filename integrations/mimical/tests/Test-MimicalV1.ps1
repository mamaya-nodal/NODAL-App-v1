$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'src\Mimical.cs'
$licenseSource = Join-Path $root 'src\MimicalLicense.cs'
$assemblyInfo = Join-Path $root 'src\Mimical.AssemblyInfo.cs'
$output = Join-Path $env:TEMP 'NodalBots.Mimical.V1.Test.dll'
$framework = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
$csc = Join-Path $framework 'csc.exe'

& $csc /nologo /target:library "/out:$output" `
    "/reference:C:\Program Files\NinjaTrader 8\bin\NinjaTrader.Core.dll" `
    "/reference:C:\Program Files\NinjaTrader 8\bin\NinjaTrader.Gui.dll" `
    "/reference:$framework\WPF\WindowsBase.dll" `
    "/reference:$framework\WPF\PresentationCore.dll" `
    "/reference:$framework\WPF\PresentationFramework.dll" `
    "/reference:$framework\System.Xaml.dll" `
    "/reference:$framework\System.Runtime.Serialization.dll" `
    "/reference:$framework\System.Security.dll" `
    $source $licenseSource $assemblyInfo
if ($LASTEXITCODE -ne 0) { throw 'La compilación aislada de MIMICAL 1.1 falló.' }

$coreAssembly = [Reflection.Assembly]::LoadFrom('C:\Program Files\NinjaTrader 8\bin\NinjaTrader.Core.dll')
[void][Reflection.Assembly]::LoadFrom('C:\Program Files\NinjaTrader 8\bin\NinjaTrader.Gui.dll')
$assembly = [Reflection.Assembly]::LoadFrom($output)
$math = $assembly.GetType('NinjaTrader.NinjaScript.AddOns.MimicalTrailingMath', $true)
function Invoke-Math([string] $name, [object[]] $arguments) { $math.GetMethod($name).Invoke($null, $arguments) }
$orderStateType = $coreAssembly.GetType('NinjaTrader.Cbi.OrderState', $true)
$cancelPending = [Enum]::Parse($orderStateType, 'CancelPending')
$working = [Enum]::Parse($orderStateType, 'Working')
$workingMethod = $assembly.GetType('NinjaTrader.NinjaScript.AddOns.MimicalWindow', $true).GetMethod('IsWorking', [Reflection.BindingFlags]'NonPublic,Static')

$cases = @(
    @{ Name = 'Cobertura long activa 3 ticks sobre SL líder'; Actual = Invoke-Math 'ActivationPrice' @($true, 30025.0, 3, 0.25); Expected = 30025.75 },
    @{ Name = 'Mover SL long actualiza el ancla'; Actual = Invoke-Math 'ActivationPrice' @($true, 30012.5, 3, 0.25); Expected = 30013.25 },
    @{ Name = 'Cobertura short activa 3 ticks bajo SL líder'; Actual = Invoke-Math 'ActivationPrice' @($false, 29975.0, 3, 0.25); Expected = 29974.25 },
    @{ Name = 'Long activa al tocar el ancla'; Actual = Invoke-Math 'ActivationReached' @($true, 30025.75, 30025.75); Expected = $true },
    @{ Name = 'Long no activa antes del ancla'; Actual = Invoke-Math 'ActivationReached' @($true, 30025.5, 30025.75); Expected = $false },
    @{ Name = 'Stop manual redefine distancia'; Actual = Invoke-Math 'RebasedDistanceTicks' @($true, 30019.25, 30018.5, 0.25); Expected = 3 },
    @{ Name = 'Distancia manual nunca queda en cero'; Actual = Invoke-Math 'RebasedDistanceTicks' @($true, 30019.25, 30019.25, 0.25); Expected = 1 },
    @{ Name = 'Trailing conserva el nuevo margen'; Actual = Invoke-Math 'StopPrice' @($true, 30019.5, 3, 0.25); Expected = 30018.75 },
    @{ Name = 'CancelPending sigue activo hasta confirmación'; Actual = $workingMethod.Invoke($null, @($cancelPending)); Expected = $true },
    @{ Name = 'Cancelled es terminal'; Actual = $workingMethod.Invoke($null, @([Enum]::Parse($orderStateType, 'Cancelled'))); Expected = $false },
    @{ Name = 'CancelSubmitted sigue activo'; Actual = $workingMethod.Invoke($null, @([Enum]::Parse($orderStateType, 'CancelSubmitted'))); Expected = $true },
    @{ Name = 'Orden Working siempre bloquea el inicio'; Actual = $workingMethod.Invoke($null, @($working)); Expected = $true }
)

$text = Get-Content -LiteralPath $source -Raw
$checks = @(
    @{ Name = 'Producto visible como MIMICAL 1.1'; Pass = $text.Contains('MIMICAL · NodalBots 1.1') },
    @{ Name = 'Menú agrupado bajo NodalBots'; Pass = $text.Contains('Header = "NodalBots"') -and $text.Contains('Header = "MIMICAL"') },
    @{ Name = 'Muestra sólo cuentas conectadas'; Pass = $text.Contains('a.Connection.Status == ConnectionStatus.Connected') -and $text.Contains('ConnectedAccounts()') },
    @{ Name = 'Actualiza la lista cuando cambia una conexión'; Pass = $text.Contains('followerRows.Children.Clear()') -and $text.Contains('leaderBox.Items.Clear()') -and $text.Contains('CONEXIÓN CAMBIÓ') },
    @{ Name = 'No existe filtro de cuentas limitado a Simulator'; Pass = -not $text.Contains('RequireSimulator') -and $text.Contains('ConnectedAccounts()') },
    @{ Name = 'No existe botón ARMAR'; Pass = -not $text.Contains('Content = "ARMAR"') },
    @{ Name = 'No existe botón DETENER'; Pass = -not $text.Contains('Content = "DETENER"') },
    @{ Name = 'No existe confirmación Replikanto Toggle off'; Pass = -not $text.Contains('Replikanto en Toggle off') },
    @{ Name = 'No existe banner SIM ONLY'; Pass = -not $text.Contains('SIM ONLY') -and -not $text.Contains('MODO SEGURO') },
    @{ Name = 'Ventana abierta valida NODAL antes de configurar'; Pass = $text.Contains('Loaded += delegate { ValidateLicense(true); }') },
    @{ Name = 'Cambio en cuenta activa agenda configuración'; Pass = $text.Contains('choice.Enabled.Click += delegate { ScheduleConfigurationApply(); };') },
    @{ Name = 'Cambio durante ciclo espera al Flat'; Pass = $text.Contains('CAMBIO PENDIENTE') -and $text.Contains('RearmForConfiguration') },
    @{ Name = 'Ciclo de Flatten vuelve a quedar listo'; Pass = $text.Contains('FLAT CONFIRMADO en todo el grupo') -and $text.Contains('ScheduleConfigurationApply();') },
    @{ Name = 'Configuración se conserva entre aperturas'; Pass = $text.Contains('settings.txt') -and $text.Contains('LoadSavedSettings') -and $text.Contains('SaveSettings') },
    @{ Name = 'No hay seguidores reales preseleccionados'; Pass = -not $text.Contains('account.Name.Equals("Simbroker"') -and -not $text.Contains('account.Name.Equals("Simprop 2"') },
    @{ Name = 'Cerrar con grupo activo queda bloqueado'; Pass = $text.Contains('hay posiciones u órdenes activas') },
    @{ Name = 'Después SL admite cero'; Pass = $text.Contains('ParseTicks(activationOffsetTicksBox, "margen después del SL", 0)') },
    @{ Name = 'Devuelve exige dos'; Pass = $text.Contains('ParseTicks(distanceTicksBox, "devolución", 2)') },
    @{ Name = 'Movimiento manual del stop sigue soportado'; Pass = $text.Contains('AdoptManualTrailingStop(reportedStop, e.OrderState)') },
    @{ Name = 'El botón funciona como activar o desactivar'; Pass = $text.Contains('if (trailing != null && trailing.Requested) DeactivateTrailing();') -and $text.Contains('DESACTIVAR TRAILING') },
    @{ Name = 'Desactivar antes del fill cancela sólo el modo pendiente'; Pass = $text.Contains('FinishTrailingDeactivationWithoutRestore("Desactivado antes del fill")') },
    @{ Name = 'Desactivar después del fill restaura salidas normales'; Pass = $text.Contains('BeginNormalExitRestore();') -and $text.Contains('TRAILING_DEACTIVATED_RESTORED') },
    @{ Name = 'TP broker restaurado nace del SL líder'; Pass = $text.Contains('SubmitRestoredTakeProfit(leaderStop)') -and $text.Contains('TP normal del broker reconstruido desde SL líder') },
    @{ Name = 'SL broker restaurado nace del TP líder'; Pass = $text.Contains('Transform(leaderTarget, coverage') -and $text.Contains('SL normal del broker recalculado desde TP líder') },
    @{ Name = 'La protección independiente conserva OCO para restauración'; Pass = $text.Contains('protection.Order.StopPrice, trailing.NormalOco') },
    @{ Name = 'La restauración se confirma antes de terminar el trailing'; Pass = $text.Contains('e.OrderState != OrderState.Accepted && e.OrderState != OrderState.Working') -and $text.Contains('CompleteNormalExitRestore') },
    @{ Name = 'La restauración acepta Sell y SellShort equivalentes al cerrar la cobertura'; Pass = $text.Contains('bool equivalentClosingSide = followerSignedPosition != 0') -and $text.Contains('(link.Order.OrderAction != unusedAction && !equivalentClosingSide)') },
    @{ Name = 'ResetTrailing no desconecta MarketData dentro del bloqueo'; Pass = $text.Contains('current.MarketDataSubscribed = false;') -and $text.Contains('marketData.Update -= OnMarketData;') -and -not $text.Contains('current.MarketData.Update -= OnMarketData;') },
    @{ Name = 'La desconexión de MarketData queda diferida'; Pass = $text.Contains('TRAILING_UNSUBSCRIBE_ERROR') -and $text.Contains('Dispatcher.BeginInvoke(new Action(delegate') },
    @{ Name = 'No se permite desactivar cuando ya sigue precio'; Pass = $text.Contains('El trailing ya está siguiendo el precio') },
    @{ Name = 'No se permite desactivar después del cierre líder'; Pass = $text.Contains('La cuenta líder ya cerró; el trailing debe completar la cobertura') },
    @{ Name = 'Activación tardía sigue retirando TP/SL normales'; Pass = $text.Contains('CancelRetiredOrdersAfterUpdate(trailing.Follower.Account, working)') },
    @{ Name = 'Existe luz con check junto al trailing'; Pass = $text.Contains('private readonly TextBlock trailingCheck') -and $text.Contains('actionButtons.Children.Add(trailingIndicator)') },
    @{ Name = 'La luz queda verde cuando trailing está activo'; Pass = $text.Contains('SetTrailingIndicator(1, "Trailing activo")') -and $text.Contains('ColorBrush(36, 151, 91)') },
    @{ Name = 'La luz muestra restauración y vuelve a apagarse'; Pass = $text.Contains('SetTrailingIndicator(2, "Restaurando TP/SL normales")') -and $text.Contains('SetTrailingIndicator(0, "Trailing desactivado")') },
    @{ Name = 'El botón distingue visualmente apagado, activo y restaurando'; Pass = $text.Contains('trailingButton.Background = ColorBrush(52, 54, 60)') -and $text.Contains('trailingButton.Background = ColorBrush(36, 151, 91)') -and $text.Contains('trailingButton.Background = ColorBrush(180, 112, 28)') },
    @{ Name = 'El indicador dice OFF, ON o restaurando'; Pass = $text.Contains('trailingCheck.Text = "OFF"') -and $text.Contains('trailingCheck.Text = "✓ ON"') -and $text.Contains('trailingCheck.Text = "..."') },
    @{ Name = 'Un clic inválido explica la configuración faltante'; Pass = $text.Contains('trailingButton.IsEnabled = true') -and $text.Contains('El trailing exige exactamente una cuenta de cobertura con ratio negativo.') },
    @{ Name = 'Distribución identificada como versión 1.1'; Pass = ([Reflection.AssemblyName]::GetAssemblyName($output).Version.ToString() -eq '1.1.0.0') }
)

$failed = New-Object System.Collections.Generic.List[string]
foreach ($case in $cases) {
    $pass = $case.Actual -eq $case.Expected
    '{0}: {1}' -f $(if ($pass) { 'OK' } else { 'FALLÓ' }), $case.Name
    if (-not $pass) { $failed.Add($case.Name) }
}
foreach ($check in $checks) {
    '{0}: {1}' -f $(if ($check.Pass) { 'OK' } else { 'FALLÓ' }), $check.Name
    if (-not $check.Pass) { $failed.Add($check.Name) }
}
if ($failed.Count -gt 0) { throw ('Fallaron: ' + ($failed -join ', ')) }
$total = $cases.Count + $checks.Count
'RESULTADO MIMICAL 1.1: {0}/{0} controles aprobados.' -f $total
