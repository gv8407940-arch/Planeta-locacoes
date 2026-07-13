@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao foi encontrado neste computador.
  echo Feche esta janela, reinicie o computador se acabou de instalar o Node.js, e tente novamente.
  pause
  exit /b 1
)

echo Iniciando o sistema Planeta Locacoes...
echo.
echo Se o navegador nao abrir sozinho, acesse:
echo http://127.0.0.1:8765/index.html?v=28
echo.
echo Este servidor local e apenas para testes no computador.
echo Para usar no iPhone sem depender do computador, publique a pasta em uma hospedagem HTTPS gratuita.
echo.
echo Mantenha esta janela aberta enquanto estiver usando o sistema.
echo.
node servidor-local.js
pause
