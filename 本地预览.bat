@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 未找到 Node.js。可以直接双击 dist 目录里的 index.html 查看。
  pause
  exit /b 1
)
node scripts\preview-server.js
pause
