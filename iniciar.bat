@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
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
node server.js
pause
