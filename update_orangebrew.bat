@echo off
echo =========================================
echo       OrangeBrew - Auto Update Script
echo =========================================
echo.
echo [1/3] Переход в папку frontend и установка зависимостей...
cd frontend
call npm install

echo.
echo [2/3] Сборка интерфейса (Frontend)...
call npm run build
cd ..

echo.
echo [3/3] Обновление Backend...
cd backend
call npm install
echo.
echo [SUCCESS] Обновление завершено!
echo Теперь вы можете запустить бэкенд командой:
echo   cd backend
echo   npm run dev
echo.
echo OrangeBrew будет доступен по адресу: http://localhost:3001
pause
