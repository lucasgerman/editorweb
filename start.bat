@echo off
echo Iniciando MaxCargo...
start "MaxCargo Backend" cmd /k "cd /d F:\Codee\MaxCargo\backend && node server.js"
timeout /t 2 /nobreak > nul
start "MaxCargo Frontend" cmd /k "cd /d F:\Codee\MaxCargo\frontend && npm run dev"
echo.
echo Backend: http://localhost:3002
echo Frontend: http://localhost:5174
