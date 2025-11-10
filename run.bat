@echo off
title Whisk AI + Veo3 Video - Port 3002
color 0A

echo.
echo ============================================================
echo.
echo    WHISK AI + VEO3 VIDEO GENERATION
echo.
echo    Port: 3002
echo    URL:  http://localhost:3002/index2.html
echo.
echo ============================================================
echo.

:: Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js chua duoc cai dat!
    echo Tai tai: https://nodejs.org/
    pause
    exit /b 1
)

:: Check dependencies
if not exist "node_modules\" (
    echo [INFO] Dang cai dat dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install that bai!
        pause
        exit /b 1
    )
)

:: Create directories
if not exist "images\" mkdir images
if not exist "videos\" mkdir videos
if not exist "projects\" mkdir projects

echo.
echo [INFO] Khoi dong server...
echo.
echo ============================================================
echo   MO TRINH DUYET VAO: http://localhost:3002/index2.html
echo ============================================================
echo.

:: Auto-open browser
start /B cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3002/index2.html"

:: Start server
node server.js

pause
