@echo off
cd /d "%~dp0.."
start "Moon Journey - Desktop Test (سكّرها لما تخلص)" cmd /k python dev_server_pc_test.py
timeout /t 1 >nul
start http://localhost:8643/pc_test/index.html
