import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Boiling from './Boiling';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock hooks
vi.mock('../hooks/useSensors', () => ({
    useSensors: vi.fn(() => ({
        sensors: { boiler: { value: 20 } }
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
        remainingTime: 3600,
        elapsedTime: 0,
        start: vi.fn(),
        stop: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn()
    }))
}));

// Mock components to simplify tree
vi.mock('../components/ProcessChart', () => ({
    ProcessChart: () => <div data-testid="process-chart" />
}));

describe('Boiling Page', () => {
    let mockStart;

    beforeEach(async () => {
        vi.clearAllMocks();
        // Setup default mocks
        const { useProcess } = await import('../hooks/useProcess');
        mockStart = vi.fn();
        useProcess.mockReturnValue({
            processState: {},
            status: 'IDLE',
            remainingTime: 3600,
            elapsedTime: 0,
            start: mockStart,
            stop: vi.fn(),
            pause: vi.fn(),
            resume: vi.fn()
        });

        // Mock localStorage
        Storage.prototype.getItem = vi.fn((key) => {
            if (key === 'currentRecipe') return JSON.stringify({
                name: 'Test Recipe',
                boil_time: 60,
                hop_additions: [{ name: 'Citra', amount: 50, time: 10 }]
            });
            return null;
        });
    });

    it('renders initial state correctly', () => {
        render(
            <MemoryRouter initialEntries={['/brewing/boil/123']}>
                <Routes>
                    <Route path="/brewing/boil/:sessionId" element={<Boiling />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('Кипячение')).toBeInTheDocument();
        // Default time from recipe
        expect(screen.getByText('60:00')).toBeInTheDocument();
        expect(screen.getByText('СТАРТ КИПЯЧЕНИЯ')).toBeInTheDocument();
        expect(screen.getByText('Citra')).toBeInTheDocument();
    });

    it('starts boiling process on button click', async () => {
        render(
            <MemoryRouter initialEntries={['/brewing/boil/123']}>
                <Routes>
                    <Route path="/brewing/boil/:sessionId" element={<Boiling />} />
                </Routes>
            </MemoryRouter>
        );

        const startBtn = screen.getByText('СТАРТ КИПЯЧЕНИЯ');
        fireEvent.click(startBtn);

        expect(mockStart).toHaveBeenCalledWith(
            expect.objectContaining({ name: 'Test Recipe' }),
            '123',
            'boil',
            'local_serial'
        );
    });

    it('displays active state when running', async () => {
        const { useProcess } = await import('../hooks/useProcess');
        useProcess.mockReturnValue({
            processState: { mode: 'boil' },
            status: 'HOLDING', // Boiling
            stepPhase: 'holding',
            remainingTime: 1800, // 30 mins
            elapsedTime: 600, // 10 mins elapsed
            start: vi.fn(),
            stop: vi.fn(),
            pause: vi.fn(),
            resume: vi.fn()
        });

        // Mock window.confirm
        window.confirm = vi.fn(() => true);

        render(
            <MemoryRouter initialEntries={['/brewing/boil/123']}>
                <Routes>
                    <Route path="/brewing/boil/:sessionId" element={<Boiling />} />
                </Routes>
            </MemoryRouter>
        );

        expect(screen.getByText('30:00')).toBeInTheDocument();
        expect(screen.getByText('КИПЕНИЕ')).toBeInTheDocument();
        expect(screen.getByText('ОСТАНОВИТЬ')).toBeInTheDocument();
    });
});
