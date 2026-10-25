@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo 请先安装 Node.js 22 或更新版本，然后重新双击此文件。
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split('.')[0]) >= 22 ? 0 : 1)"
if errorlevel 1 (
  echo 当前 Node.js 版本较旧，请使用 Node.js 22 或更新版本。
  pause
  exit /b 1
)
node scripts\build-guides.js
if errorlevel 1 (
  echo 生成未完成，请查看上面的提示。
  pause
  exit /b 1
)
echo 已生成资料页。双击 dist\guide\index.html 即可阅读。
pause
