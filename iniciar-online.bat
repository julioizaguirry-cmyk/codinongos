@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
  pause
  exit /b 1
)
where cloudflared >nul 2>nul
if errorlevel 1 (
  echo cloudflared nao encontrado. Instale com: winget install --id Cloudflare.cloudflared
  echo Depois feche esta janela e rode este arquivo de novo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Instalando dependencias. Isso so acontece na primeira vez e precisa de internet...
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo Falha ao instalar. Verifique a internet e tente de novo.
    pause
    exit /b 1
  )
)
start "CODINONGOS servidor" cmd /k node server.js
echo.
echo Procure abaixo o endereco https://algo.trycloudflare.com e cole no campo Servidor do jogo.
echo Jogo: https://juliorlixo.neocities.org/codinongos
echo.
cloudflared tunnel --url http://localhost:3000
pause
