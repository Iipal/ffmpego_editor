@echo off
title Auto-update and Run the FFmpego Editor
echo === Start automation script ===

echo Running: git pull...
git pull
if %errorlevel% neq 0 (
    echo [ERROR] git pull failed. Exiting...
    pause
    exit /b %errorlevel%
)

echo Running: bun install...
call bun install
if %errorlevel% neq 0 (
    echo [ERROR] bun install failed. Exiting...
    pause
    exit /b %errorlevel%
)

echo Opening browser at localhost:3050...
:: Скрипт почекає 3 секунди, поки сервер запускається, і відкриє сторінку
start "" http://localhost:3050

echo Running: bunx turbo dev...
call bunx turbo dev

pause
