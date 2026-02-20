import { test, expect } from '@playwright/test';

test.describe('Блок Пивоварения - Е2Е тесты', () => {

    test('Создание идеального рецепта (позитивный тест)', async ({ page }) => {
        // Устанавливаем таймаут чуть больше для локального сервера
        test.setTimeout(30000);

        // Открываем страницу создания рецепта
        await page.goto('http://localhost:5173/brewing/recipes/new');

        // Ввод названия
        await page.fill('input[placeholder="Напр: Жигулевское"]', 'Тестовый E2E Рецепт');

        // Ввод объема и времени кипячения (время = 1 минута)
        const numberInputs = await page.$$('input[type="number"]');
        await numberInputs[0].fill('20'); // объем
        await numberInputs[1].fill('1');  // время кипячения 1 мин

        // Заполняем первую температурную паузу (60 градусов, 1 минута)
        const temperatures = await page.$$('input[aria-label="Температура"]');
        const durations = await page.$$('input[aria-label="Длительность"]');
        await temperatures[0].fill('60');
        await durations[0].fill('1');

        // Добавляем вторую паузу
        await page.click('button:has-text("Добавить паузу")');

        const newTemperatures = await page.$$('input[aria-label="Температура"]');
        const newDurations = await page.$$('input[aria-label="Длительность"]');
        // Вторая пауза: 65 градусов, 1 минута
        await newTemperatures[1].fill('65');
        await newDurations[1].fill('1');

        // Добавляем третью паузу
        await page.click('button:has-text("Добавить паузу")');

        const thirdTemperatures = await page.$$('input[aria-label="Температура"]');
        const thirdDurations = await page.$$('input[aria-label="Длительность"]');
        // Третья пауза: 78 градусов, 1 минута (Мэшаут)
        await thirdTemperatures[2].fill('78');
        await thirdDurations[2].fill('1');

        // Сохранить и перейти к варке
        await page.click('button:has-text("Начать варку")');

        // Убедиться, что нас перекинуло на страницу затирания
        await expect(page).toHaveURL(/.*\/brewing\/mash\/.*/);

        // Убедиться, что "ЦЕЛЬ" обновилась до температуры ПЕРВОЙ паузы (60°С), а не 65
        await expect(page.locator('text=ЦЕЛЬ: 60')).toBeVisible();

        // Обязательно подтверждаем, что ТЭНы закрыты жидкостью (иначе кнопка СТАРТ недоступна!)
        await page.click('input[type="checkbox"]');

        // Запуск затирания
        await page.click('button:has-text("СТАРТ ЗАТИРАНИЯ")');

        // Появилась кнопка ПАУЗА вместо ПРОДОЛЖИТЬ
        await expect(page.locator('button:has-text("ПАУЗА")')).toBeVisible();

        // Остановка процесса
        page.once('dialog', dialog => dialog.accept());
        await page.click('button:has-text("ПАУЗА")');
        await expect(page.locator('button:has-text("ПРОДОЛЖИТЬ")')).toBeVisible();
    });

    test('Создание рецепта (негативный тест): нарушение возрастания температур пауз', async ({ page }) => {
        await page.goto('http://localhost:5173/brewing/recipes/new');

        await page.fill('input[placeholder="Напр: Жигулевское"]', 'Сломанный Рецепт');

        // Заполняем первую температурную паузу (70 градусов)
        const temperatures = await page.$$('input[aria-label="Температура"]');
        await temperatures[0].fill('70');

        // Добавляем вторую паузу
        await page.click('button:has-text("Добавить паузу")');

        const newTemperatures = await page.$$('input[aria-label="Температура"]');
        // Делаем вторую паузу ХОЛОДНЕЕ первой (65 градусов) — такого не может быть!
        await newTemperatures[1].fill('65');

        // Нам нужно "поймать" окно ошибки (alert)
        let dialogMessage = '';
        page.once('dialog', dialog => {
            dialogMessage = dialog.message();
            dialog.dismiss();
        });

        // Пытаемся сохранить
        await page.click('button:has-text("Начать варку")');

        // Проверяем, что появилось нужное сообщение об ошибке
        expect(dialogMessage).toContain('должна быть выше температуры паузы');

        // Убеждаемся, что мы НИКУДА не перешли и остались в редакторе рецепта
        await expect(page).toHaveURL(/.*\/brewing\/recipes\/new/);
    });

    test('Редактирование рецепта', async ({ page }) => {
        // Заходим в список рецептов
        await page.goto('http://localhost:5173/brewing/recipes');

        // Кликаем по кнопке редактирования первого рецепта (значок карандаша)
        // Если рецептов нет, тест упадет, но предполагается, что предыдущий тест создал один
        const editButton = page.locator('button[aria-label="Редактировать рецепт"]').first();
        await editButton.click();

        // Убедиться, что открылся редактор
        await expect(page).toHaveURL(/.*\/brewing\/recipes\/.*/);

        // Изменяем название
        await page.fill('input[placeholder="Напр: Жигулевское"]', 'Отредактированный E2E Рецепт');

        // Сохраняем просто в базу (без старта варки)
        await page.click('button:has-text("Сохранить")');

        // Проверяем, что выбросило обратно в меню рецептов
        await expect(page).toHaveURL(/.*\/brewing\/recipes/);
    });

});
