@echo off
setlocal
chcp 65001 >nul
title Instalador del conector NODAL

if not exist "%~dp0NODAL-Ninja-Connector-setup.ps1" (
  echo.
  echo Este archivo se abrio dentro del ZIP y Windows no extrajo el instalador completo.
  echo No se realizo ningun cambio en el conector.
  echo.
  echo 1. Cerra esta ventana.
  echo 2. En Descargas, hace clic derecho sobre NODAL-Ninja-Connector.zip.
  echo 3. Elegi "Extraer todo".
  echo 4. Abri la carpeta extraida y ejecuta INSTALAR-NODAL.cmd nuevamente.
  echo.
  pause
  exit /b 2
)

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
