@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao foi encontrado neste computador.
  echo Instale o Node.js ou abra este projeto por outro servidor local.
  pause
  exit /b 1
)

echo Iniciando o sistema Planeta Locacoes...
echo Este servidor local e apenas para testes no computador.
echo Para usar no iPhone sem depender do computador, publique a pasta em uma hospedagem HTTPS gratuita.
echo.
echo Mantenha esta janela aberta enquanto estiver usando o sistema.
node servidor-local.js
pause
