@echo off
setlocal
chcp 65001 >nul
title Instalador del conector NODAL

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0NODAL-Ninja-Connector-setup.ps1"
if errorlevel 1 (
  echo.
  echo No se pudo instalar el conector. Revisa el mensaje anterior.
  pause
  exit /b 1
)

echo.
echo Instalacion terminada. Abri NinjaTrader y compila NodalNinjaConnector.
pause
