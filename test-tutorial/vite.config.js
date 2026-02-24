import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    plugins: [react()],
    test: {
        // Включаем глобальные переменные для тестов (необязательно, но удобно)
        globals: true,
        // Используем jsdom для имитации браузера в консоли
        environment: 'jsdom',
        // Подключаем расширения для expect (например, toBeInTheDocument)
        setupFiles: './src/setupTests.js',
    },
});
