@echo off
setlocal
chcp 65001 >nul
title Actualizar o agregar vinculo NODAL

if not exist "%~dp0NODAL-Ninja-Connector-setup.ps1" (
  echo.
  echo Este archivo se abrio dentro del ZIP y Windows no extrajo el instalador completo.
  echo No se realizo ningun cambio en el conector.
  echo.
  echo 1. Cerra esta ventana.
  echo 2. En Descargas, hace clic derecho sobre NODAL-Ninja-Connector.zip.
  echo 3. Elegi "Extraer todo".
  echo 4. Abri la carpeta extraida y ejecuta ACTUALIZAR-NODAL.cmd nuevamente.
  echo.
  pause
  exit /b 2
)

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0NODAL-Ninja-Connector-setup.ps1" -UpdateOnly
if errorlevel 1 (
  echo No se pudo actualizar o agregar el vinculo. Revisa el mensaje anterior.
  pause
  exit /b 1
)
echo Abri NinjaTrader y compila NodalNinjaConnector para activar los cambios.
pause
