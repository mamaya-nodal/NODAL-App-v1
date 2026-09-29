@echo off
setlocal
title Actualizar conector NODAL sin desvincular
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0NODAL-Ninja-Connector-setup.ps1" -UpdateOnly
if errorlevel 1 (
  echo No se pudo actualizar. Revisa el mensaje anterior.
  pause
  exit /b 1
)
echo Abri NinjaTrader y compila NodalNinjaConnector para activar la actualizacion.
pause
