import React, { useState } from 'react';

/**
 * Простой компонент счетчика.
 * Здесь мы будем тестировать взаимодействие пользователя с интерфейсом.
 */
function Counter() {
    const [count, setCount] = useState(0);

    return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
            <h1>Счетчик для тестов</h1>
            <p data-testid="count-value">Текущее значение: {count}</p>

            <button
                onClick={() => setCount(count + 1)}
                style={{ padding: '10px 20px', cursor: 'pointer' }}
            >
                Увеличить
            </button>

            <button
                onClick={() => setCount(count - 1)}
                style={{ padding: '10px 20px', cursor: 'pointer', marginLeft: '10px' }}
            >
                Уменьшить
            </button>
        </div>
    );
}

export default Counter;
