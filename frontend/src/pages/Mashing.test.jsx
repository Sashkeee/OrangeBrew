import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Mashing from './Mashing';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock hooks
vi.mock('../hooks/useSensors', () => ({
    useSensors: vi.fn(() => ({
        sensors: { boiler: { value: 65 } },
        rawSensors: []
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

        // Mock localStorage
        Storage.prototype.getItem = vi.fn((key) => {
            if (key === 'currentRecipe') return JSON.stringify({
                name: 'Test IPA',
                mash_steps: [{ name: 'Test Step 1', temp: 65, duration: 60 }]
            });
            return null;
        });
    });

    it('renders initial state correctly with safety check', () => {
        render(
            <MemoryRouter initialEntries={['/brewing/123']}>
                <Routes>
                    <Route path="/brewing/:sessionId" element={<Mashing />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText(/Затирание: Test IPA/)).toBeInTheDocument();
        const startBtn = screen.getByText(/СТАРТ ЗАТИРАНИЯ/);
        expect(startBtn).toBeDisabled();
    });

    it('enables start button after safety check', () => {
        render(
            <MemoryRouter initialEntries={['/brewing/123']}>
                <Routes>
                    <Route path="/brewing/:sessionId" element={<Mashing />} />
                </Routes>
            </MemoryRouter>
        );

        const confirmBtn = screen.getByText('Confirm Safety');
        fireEvent.click(confirmBtn);

        const startBtn = screen.getByText(/СТАРТ ЗАТИРАНИЯ/);
        expect(startBtn).not.toBeDisabled();

        fireEvent.click(startBtn);
        expect(mockStart).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Test IPA' }),
            '123',
            'mash',
            'local_serial',
            null
        );
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
