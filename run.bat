@echo off
:: ################################################################
:: # UPDATED: 2025-11-10 - Veo3 Video Generation Integration
:: # - Fixed PowerShell logging command for compatibility
:: # - Dual output: console + log file for debugging
:: ################################################################
setlocal enabledelayedexpansion
title Whisk AI Server - Port 3002
color 0A

:: ============================================
:: WHISK AI - IMAGE GENERATION & EDITING
:: ============================================

:: Create log file name with timestamp
set LOG_FILE=whisk_server_%date:~-4,4%%date:~-10,2%%date:~-7,2%_%time:~0,2%%time:~3,2%%time:~6,2%.log
set LOG_FILE=%LOG_FILE: =0%

:: Initialize log file
echo. > "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"
echo WHISK AI SERVER - STARTUP LOG >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"
echo Start Time: %date% %time% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: Display header
cls
echo.
echo ============================================================
echo.
echo         WHISK AI - IMAGE GENERATION ^& EDITING
echo.
echo         Google Labs Whisk API Integration
echo.
echo ============================================================
echo.
echo [%time%] Khoi dong server...
echo [%time%] Khoi dong server... >> "%LOG_FILE%"
echo.

:: Check Node.js installation
echo [CHECK] Kiem tra Node.js...
echo [%time%] Kiem tra Node.js... >> "%LOG_FILE%"
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js chua duoc cai dat! >> "%LOG_FILE%"
    echo.
    echo [ERROR] Node.js chua duoc cai dat!
    echo.
    echo Vui long cai dat Node.js tu: https://nodejs.org/
    echo Khuyen nghi: Node.js v18.x hoac cao hon
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [OK] Node.js version: %NODE_VERSION%
echo [OK] Node.js version: %NODE_VERSION% >> "%LOG_FILE%"

:: Check npm
echo [CHECK] Kiem tra npm...
echo [%time%] Kiem tra npm... >> "%LOG_FILE%"
npm --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] npm chua duoc cai dat! >> "%LOG_FILE%"
    echo.
    echo [ERROR] npm chua duoc cai dat!
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo [OK] npm version: v%NPM_VERSION%
echo [OK] npm version: v%NPM_VERSION% >> "%LOG_FILE%"

:: Check if node_modules exists
echo [CHECK] Kiem tra dependencies...
echo [%time%] Kiem tra dependencies... >> "%LOG_FILE%"
if not exist "node_modules\" (
    echo [WARNING] node_modules chua duoc cai dat
    echo [WARNING] node_modules chua duoc cai dat >> "%LOG_FILE%"
    echo.
    echo Dang cai dat dependencies... Vui long doi...
    echo [%time%] Running npm install... >> "%LOG_FILE%"
    call npm install >> "%LOG_FILE%" 2>&1
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install that bai!
        echo [ERROR] npm install that bai! >> "%LOG_FILE%"
        echo Vui long kiem tra log file: %LOG_FILE%
        echo.
        pause
        exit /b 1
    )
    echo [OK] Dependencies da duoc cai dat
    echo [OK] Dependencies da duoc cai dat >> "%LOG_FILE%"
) else (
    echo [OK] Dependencies da san sang
    echo [OK] Dependencies da san sang >> "%LOG_FILE%"
)

:: Check if server.js exists
echo [CHECK] Kiem tra file server...
echo [%time%] Kiem tra file server... >> "%LOG_FILE%"
if not exist "server.js" (
    echo.
    echo [ERROR] Khong tim thay server.js!
    echo [ERROR] Khong tim thay server.js! >> "%LOG_FILE%"
    echo.
    pause
    exit /b 1
)
echo [OK] File server.js ton tai
echo [OK] File server.js ton tai >> "%LOG_FILE%"

:: Create required directories
echo [CHECK] Tao cac thu muc can thiet...
echo [%time%] Tao cac thu muc can thiet... >> "%LOG_FILE%"
if not exist "images\" mkdir images
if not exist "assets\" mkdir assets
if not exist "projects\" mkdir projects
if not exist "chrome-profile\" mkdir chrome-profile
echo [OK] Cac thu muc da san sang
echo [OK] Cac thu muc da san sang >> "%LOG_FILE%"

:: Display instructions
echo.
echo ============================================================
echo   HUONG DAN SU DUNG:
echo ============================================================
echo.
echo 1. Server se khoi dong tren:  http://localhost:3002
echo.
echo 2. Browser se tu dong mo sau 3 giay
echo.
echo 3. Trong giao dien web:
echo    - Click nut "Khoi dong" de mo Chrome
echo    - Dang nhap Google neu can
echo    - Click nut "Token" de bat token
echo    - Bat dau tao anh!
echo.
echo    *** QUAN TRONG ***
echo    KHONG duoc click dup vao file index.html!
echo    PHAI mo qua duong link: http://localhost:3002
echo.
echo ============================================================
echo   THONG TIN SERVER:
echo ============================================================
echo.
echo Port:     3002
echo URL:      http://localhost:3002
echo Log file: %LOG_FILE%
echo.
echo ============================================================
echo.

:: Wait a moment
timeout /t 2 /nobreak >nul

:: Auto-open browser after 3 seconds
echo [%time%] Se tu dong mo browser sau 3 giay...
echo [%time%] Se tu dong mo browser sau 3 giay... >> "%LOG_FILE%"
start /B cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3002"

:: Start server
echo [%time%] Bat dau khoi dong server...
echo [%time%] Bat dau khoi dong server... >> "%LOG_FILE%"
echo.
echo ============================================================
echo SERVER DANG CHAY - Nhan Ctrl+C de dung
echo ============================================================
echo.
echo Server log: %LOG_FILE%
echo.

:: Run server (log to both console and file)
echo ============================================================ >> "%LOG_FILE%"
echo SERVER OUTPUT - START >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"

node server.js 2>&1 | "%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "$input | ForEach-Object { Write-Host $_; Add-Content -Path '%LOG_FILE%' -Value $_ }"

:: If server stops, log it
echo.
echo. >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"
echo SERVER OUTPUT - END >> "%LOG_FILE%"
echo ============================================================ >> "%LOG_FILE%"
echo [%time%] Server da dung >> "%LOG_FILE%"
echo End Time: %date% %time% >> "%LOG_FILE%"

echo.
echo ============================================================
echo.
echo [%time%] Server da dung
echo.
echo Log file: %LOG_FILE%
echo.
echo ============================================================
echo.
echo Nhan phim bat ky de thoat...
pause
