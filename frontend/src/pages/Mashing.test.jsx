import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Mashing from './Mashing';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock hooks
vi.mock('../hooks/useSensors', () => ({
    useSensors: vi.fn(() => ({
        sensors: { boiler: { value: 65 } },
        rawSensors: [],
        namedSensors: [],
        sensorConfig: [],
        reloadConfig: vi.fn(),
        connected: true,
        error: null,
    }))
}));

vi.mock('../hooks/useControl', () => ({
    useControl: vi.fn(() => ({
        control: { heater: 0, pump: false },
        setHeater: vi.fn(),
        setPump: vi.fn()
    }))
}));

vi.mock('../hooks/useProcess', () => ({
    useProcess: vi.fn(() => ({
        processState: {},
        status: 'IDLE',
        stepPhase: 'heating',
        remainingTime: 3600,
        elapsedTime: 0,
        activeStepIndex: 0,
        currentStep: { name: 'Пауза осахаривания', temp: 65, duration: 60 },
        start: vi.fn(),
        stop: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn(),
        skip: vi.fn()
    }))
}));

// Mock API client — рецепт теперь загружается из API, не из localStorage
vi.mock('../api/client.js', () => ({
    sessionsApi: {
        getById: vi.fn().mockResolvedValue({ id: 123, recipe_id: 42 }),
        getTemperatures: vi.fn().mockResolvedValue([]),
    },
    recipesApi: {
        getById: vi.fn().mockResolvedValue({
            id: 42,
            name: 'Test IPA',
            mash_steps: [{ name: 'Test Step 1', temp: 65, duration: 60 }],
            hop_additions: [],
        }),
    },
    // DeviceSelector использует deviceApi
    deviceApi: {
        getAll: vi.fn().mockResolvedValue([]),
    },
    sensorsApi: {
        getCurrent: vi.fn().mockResolvedValue({}),
        getConfig: vi.fn().mockResolvedValue([]),
        getDiscovered: vi.fn().mockResolvedValue([]),
    },
}));

// Mock components to simplify tree
vi.mock('../components/ProcessChart', () => ({
    ProcessChart: () => <div data-testid="process-chart" />
}));

vi.mock('../components/SafetyCheck', () => ({
    SafetyCheck: ({ onChange }) => (
        <div data-testid="safety-check">
            <button onClick={() => onChange(true)}>Confirm Safety</button>
        </div>
    )
}));

describe('Mashing Page', () => {
    let mockStart;
    let mockSkip;

    beforeEach(async () => {
        vi.clearAllMocks();
        const { useProcess } = await import('../hooks/useProcess');
        mockStart = vi.fn();
        mockSkip = vi.fn();

        useProcess.mockReturnValue({
            processState: {},
            status: 'IDLE',
            stepPhase: 'heating',
            remainingTime: 3600,
            elapsedTime: 0,
            activeStepIndex: 0,
            currentStep: { name: 'Пауза осахаривания', temp: 65, duration: 60 },
            start: mockStart,
            stop: vi.fn(),
            pause: vi.fn(),
            resume: vi.fn(),
            skip: mockSkip
        });

        // localStorage больше не используется для передачи рецепта
    });

    it('renders initial state correctly with safety check', async () => {
        render(
            <MemoryRouter initialEntries={['/brewing/123']}>
                <Routes>
                    <Route path="/brewing/:sessionId" element={<Mashing />} />
                </Routes>
            </MemoryRouter>
        );

        // Рецепт загружается асинхронно из API
        await waitFor(() => expect(screen.getByText(/Затирание: Test IPA/)).toBeInTheDocument());
        const startBtn = screen.getByText(/СТАРТ ЗАТИРАНИЯ/);
        expect(startBtn).toBeDisabled();
    });

    it('enables start button after safety check', async () => {
        render(
            <MemoryRouter initialEntries={['/brewing/123']}>
                <Routes>
                    <Route path="/brewing/:sessionId" element={<Mashing />} />
                </Routes>
            </MemoryRouter>
        );

        // Ждём загрузки рецепта из API
        await waitFor(() => expect(screen.getByText(/Затирание: Test IPA/)).toBeInTheDocument());

        const confirmBtn = screen.getByText('Confirm Safety');
        fireEvent.click(confirmBtn);

        const startBtn = screen.getByText(/СТАРТ ЗАТИРАНИЯ/);
        expect(startBtn).not.toBeDisabled();

        fireEvent.click(startBtn);
        await waitFor(() => expect(mockStart).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Test IPA' }),
            '123',
            'mash',
            'local_serial',
            null
        ));
    });

    it('displays active state when running', async () => {
        const { useProcess } = await import('../hooks/useProcess');
        useProcess.mockReturnValue({
            processState: { mode: 'mash' },
            status: 'HOLDING',
            stepPhase: 'holding',
            remainingTime: 3000,
            elapsedTime: 600,
            activeStepIndex: 0,
            currentStep: { name: 'Test Step 1', temp: 65, duration: 60 },
            start: vi.fn(),
            stop: vi.fn(),
            pause: vi.fn(),
            resume: vi.fn(),
            skip: mockSkip
        });

        // Mock window.confirm
        window.confirm = vi.fn(() => true);

        render(
            <MemoryRouter initialEntries={['/brewing/123']}>
                <Routes>
                    <Route path="/brewing/:sessionId" element={<Mashing />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('50:00')).toBeInTheDocument();
        expect(screen.getByText('УДЕРЖАНИЕ')).toBeInTheDocument();

        // Skip button should be present
        const skipBtn = screen.getByRole('button', { name: /ПРОПУСТИТЬ/i });
        fireEvent.click(skipBtn);
        expect(mockSkip).toHaveBeenCalled();
    });
});
