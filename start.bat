@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Douhao Daily Diary - local server

set PORT=8765

echo.
echo   Douhao's Daily Diary  ^|  逗号的生活日记
echo   ------------------------------------------
echo   Starting local server at http://localhost:%PORT%/
echo   (Keep this window open while using the diary)
echo.

where python >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/"
  python -m http.server %PORT%
  goto :end
)

where py >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/"
  py -m http.server %PORT%
  goto :end
)

where node >nul 2>nul
if %errorlevel%==0 (
  start "" "http://localhost:%PORT%/"
  node "%~dp0server.js" %PORT%
  goto :end
)

echo   Python / Node not found.
echo   You can still open index.html directly by double-clicking it.
pause

:end
