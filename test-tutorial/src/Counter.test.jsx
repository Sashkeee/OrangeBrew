import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import Counter from './Counter';

// После каждого теста очищаем DOM, чтобы тесты не мешали друг другу
afterEach(() => {
    cleanup();
});

describe('Компонент Counter', () => {

    it('должен отображать начальное значение 0', () => {
        // render — отрисовывает компонент в виртуальной памяти (как в браузере)
        render(<Counter />);

        // screen.getByText ищет элемент на экране, в котором есть указанный текст
        const message = screen.getByText(/Текущее значение: 0/i);

        // Проверяем, что этот текст действительно появился в документе
        expect(message).toBeInTheDocument();
    });

    it('должен увеличивать значение при клике на кнопку', () => {
        render(<Counter />);

        // Находим кнопку по тексту "Увеличить"
        const incrementBtn = screen.getByText(/Увеличить/i);

        // fireEvent.click имитирует реальный клик пользователя по кнопке
        fireEvent.click(incrementBtn);

        // Теперь ищем текст с цифрой 1
        const message = screen.getByText(/Текущее значение: 1/i);
        expect(message).toBeInTheDocument();
    });

    it('должен уменьшать значение при клике на кнопку', () => {
        render(<Counter />);

        const decrementBtn = screen.getByText(/Уменьшить/i);

        // Кликаем по кнопке "Уменьшить"
        fireEvent.click(decrementBtn);

        // Ожидаем, что 0 превратился в -1
        const message = screen.getByText(/Текущее значение: -1/i);
        expect(message).toBeInTheDocument();
    });

    it('должен правильно считать несколько кликов подряд', () => {
        render(<Counter />);

        const incrementBtn = screen.getByText(/Увеличить/i);

        // Три клика подряд
        fireEvent.click(incrementBtn);
        fireEvent.click(incrementBtn);
        fireEvent.click(incrementBtn);

        // Должно быть 3
        expect(screen.getByText(/Текущее значение: 3/i)).toBeInTheDocument();
    });

    it('должен использовать data-testid для надежного поиска', () => {
        render(<Counter />);

        // Поиск по data-testid — самый надежный способ. Не зависит от текста.
        const countEl = screen.getByTestId('count-value');

        expect(countEl).toBeInTheDocument();
        expect(countEl.textContent).toBe('Текущее значение: 0');
    });

});
