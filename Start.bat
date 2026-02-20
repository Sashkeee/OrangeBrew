@echo off
chcp 65001 > nul
echo Запускаем проект Orange Brew...

:: Переходим в главную папку проекта
cd /d C:\Users\user\Documents\Antigravity\OrangeBrew

:: Запускаем бэкенд в новом окне
start "Orange Brew Backend" cmd /k "cd backend && npm run dev"

:: Запускаем фронтенд в новом окне
start "Orange Brew Frontend" cmd /k "cd frontend && npm run dev"