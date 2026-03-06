@echo off
setlocal EnableDelayedExpansion

title LabelingTool — Release Build

echo.
echo ============================================================
echo   LabelingTool Release Build
echo ============================================================
echo.

:: ─── Check Node.js ──────────────────────────────────────────────────────────
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js not found. Install from https://nodejs.org
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo [OK] Node.js %NODE_VER%

:: ─── Check npm ──────────────────────────────────────────────────────────────
where npm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm not found.
    pause & exit /b 1
)

:: ─── Navigate to project root ────────────────────────────────────────────────
cd /d "%~dp0.."
echo [OK] Working directory: %CD%

:: ─── Generate icon if missing ────────────────────────────────────────────────
if not exist "resources\icon.ico" (
    echo.
    echo [INFO] Generating app icon...
    node scripts\generate-icon.js
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Icon generation failed.
        pause & exit /b 1
    )
) else (
    echo [OK] Icon found: resources\icon.ico
)

:: ─── Install dependencies ────────────────────────────────────────────────────
echo.
echo [STEP 1/4] Installing dependencies...
call npm install --prefer-offline
if %ERRORLEVEL% neq 0 (
    echo [ERROR] npm install failed.
    pause & exit /b 1
)
echo [OK] Dependencies installed.

:: ─── Build renderer + main ──────────────────────────────────────────────────
echo.
echo [STEP 2/4] Building application (production)...
set NODE_ENV=production
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Build failed.
    pause & exit /b 1
)
echo [OK] Application built.

:: ─── Package NSIS installer ─────────────────────────────────────────────────
echo.
echo [STEP 3/4] Packaging NSIS installer...
call npx electron-builder --win --x64
if %ERRORLEVEL% neq 0 (
    echo [ERROR] electron-builder failed.
    pause & exit /b 1
)
echo [OK] Installer created.

:: ─── Show output ────────────────────────────────────────────────────────────
echo.
echo [STEP 4/4] Build complete!
echo.
echo Output:
dir /b "dist\*.exe" 2>nul || echo   (no .exe found in dist\)
echo.
echo ============================================================
echo   Installer is in the dist\ folder.
echo ============================================================
echo.

:: Open the dist folder in Explorer
if exist "dist" start "" explorer.exe "%CD%\dist"

pause
endlocal
