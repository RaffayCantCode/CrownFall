@echo off
title Crownfall — Local Development Server
cd /d "%~dp0"

echo ========================================================
echo   CROWNFALL — Local Server ^& Client Launcher
echo   Starting Vite client + Game server on port 9000...
echo   Your browser will open http://localhost:9000/ shortly.
echo   Press Ctrl+C at any time to stop the server.
echo ========================================================
echo.

start "" /b cmd /c "timeout /t 4 /nobreak >nul & start http://localhost:9000/"
call npm run dev
pause
