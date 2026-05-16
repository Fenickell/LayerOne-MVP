@echo off
setlocal

set "ROOT=%~dp0"
set "URL=http://127.0.0.1:8791"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js nao foi encontrado no PATH.
  echo Instale o Node.js ou abra este projeto pelo ambiente onde o Node ja funciona.
  echo.
  pause
  exit /b 1
)

echo.
echo LayerOne MVP
echo Endereco fixo: %URL%
echo.
echo Uma janela do navegador sera aberta em alguns segundos.
echo Mantenha esta janela aberta enquanto estiver usando o sistema.
echo Para encerrar, pressione Ctrl+C.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process '%URL%'"

cd /d "%ROOT%"
node "%ROOT%server.js"

echo.
echo Servidor encerrado.
pause
