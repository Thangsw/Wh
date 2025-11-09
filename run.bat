@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

:: ============================================
:: WHISK AI - LAUNCHER SCRIPT
:: ============================================

title Whisk AI Image Generator

:: Thiết lập màu sắc
color 0A

:: Tạo thư mục logs nếu chưa có
if not exist "logs" mkdir logs

:: Tạo tên file log với timestamp
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set LOG_FILE=logs\run_%datetime:~0,8%_%datetime:~8,6%.log

:: Bắt đầu ghi log
echo ============================================ > "%LOG_FILE%"
echo WHISK AI - IMAGE GENERATOR >> "%LOG_FILE%"
echo Started: %date% %time% >> "%LOG_FILE%"
echo ============================================ >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

:: Banner
cls
echo.
echo ============================================================
echo.
echo         🎨 WHISK AI - IMAGE GENERATOR 🎨
echo.
echo         Google Labs Whisk API Integration
echo.
echo ============================================================
echo.
echo [%time%] Starting Whisk AI Server...
echo.

:: Kiểm tra Node.js
echo [CHECK] Checking Node.js installation...
echo [%time%] Checking Node.js installation... >> "%LOG_FILE%"

node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ❌ ERROR: Node.js not found!
    echo.
    echo Please install Node.js from: https://nodejs.org/
    echo Recommended version: v18.x or higher
    echo.
    echo [ERROR] Node.js not installed >> "%LOG_FILE%"
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js found: %NODE_VERSION%
echo [OK] Node.js version: %NODE_VERSION% >> "%LOG_FILE%"
echo.

:: Kiểm tra npm
echo [CHECK] Checking npm...
echo [%time%] Checking npm... >> "%LOG_FILE%"

npm --version >nul 2>&1
if errorlevel 1 (
    echo ❌ ERROR: npm not found!
    echo [ERROR] npm not installed >> "%LOG_FILE%"
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo ✅ npm found: v%NPM_VERSION%
echo [OK] npm version: v%NPM_VERSION% >> "%LOG_FILE%"
echo.

:: Kiểm tra dependencies
echo [CHECK] Checking dependencies...
echo [%time%] Checking dependencies... >> "%LOG_FILE%"

if not exist "node_modules" (
    echo.
    echo ⚠️  WARNING: Dependencies not installed!
    echo.
    echo Installing dependencies... Please wait...
    echo [WARNING] Installing dependencies... >> "%LOG_FILE%"
    echo.

    call npm install >> "%LOG_FILE%" 2>&1

    if errorlevel 1 (
        echo.
        echo ❌ ERROR: Failed to install dependencies!
        echo Please check the log file: %LOG_FILE%
        echo [ERROR] npm install failed >> "%LOG_FILE%"
        pause
        exit /b 1
    )

    echo ✅ Dependencies installed successfully!
    echo [OK] Dependencies installed >> "%LOG_FILE%"
    echo.
) else (
    echo ✅ Dependencies already installed
    echo [OK] Dependencies found >> "%LOG_FILE%"
    echo.
)

:: Tạo các thư mục cần thiết
echo [CHECK] Creating required directories...
echo [%time%] Creating directories... >> "%LOG_FILE%"

if not exist "images" mkdir images
if not exist "assets" mkdir assets
if not exist "projects" mkdir projects
if not exist "chrome-profile" mkdir chrome-profile

echo ✅ All directories ready
echo [OK] Directories created >> "%LOG_FILE%"
echo.

:: Hiển thị hướng dẫn
echo ============================================================
echo.
echo 📋 QUICK START GUIDE:
echo.
echo   1. Server will start on: http://localhost:3002
echo   2. Browser will open automatically
echo   3. Click "🚀 Khởi động" to launch Chrome
echo   4. Login to Google account if needed
echo   5. Click "🔑 Token" to capture credentials
echo   6. Start generating images!
echo.
echo ============================================================
echo.
echo 📝 Log file: %LOG_FILE%
echo.
echo ============================================================
echo.

:: Đợi 2 giây
timeout /t 2 /nobreak >nul

:: Chạy server và ghi log
echo [%time%] Starting server... >> "%LOG_FILE%"
echo.
echo [START] Server is starting...
echo.
echo ────────────────────────────────────────────────────────────
echo.

:: Mở browser tự động sau 3 giây
start /B cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3002"

:: Chạy server (output sẽ hiện trên console)
:: Log chi tiết sẽ được server tự ghi vào file
node server.js

:: Khi server dừng
echo.
echo.
echo ============================================================
echo.
echo [%time%] Server stopped
echo.
echo Log saved to: %LOG_FILE%
echo.
echo ============================================================
echo.
echo [%time%] Server stopped >> "%LOG_FILE%"

pause
