@echo off
setlocal
chcp 65001 >nul
title Actualizar o agregar vinculo NODAL
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0NODAL-Ninja-Connector-setup.ps1" -UpdateOnly
if errorlevel 1 (
  echo No se pudo actualizar o agregar el vinculo. Revisa el mensaje anterior.
  pause
  exit /b 1
)
echo Abri NinjaTrader y compila NodalNinjaConnector para activar los cambios.
pause
