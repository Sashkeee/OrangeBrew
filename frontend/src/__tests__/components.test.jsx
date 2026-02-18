import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// ─── Import components ────────────────────────────────────
import { PageHeader } from '../components/PageHeader';
import { SensorCard } from '../components/SensorCard';
import { ProcessChart } from '../components/ProcessChart';
import { PhaseList } from '../components/PhaseList';
import { SafetyCheck } from '../components/SafetyCheck';
import { StartButton } from '../components/StartButton';

// ═══════════════════════════════════════════════════════════
//  PageHeader
// ═══════════════════════════════════════════════════════════

describe('PageHeader', () => {
    const renderHeader = (props = {}) => render(
        <MemoryRouter>
            <PageHeader title="Test Page" {...props} />
        </MemoryRouter>
    );

    it('should render the title', () => {
        renderHeader();
        expect(screen.getByText('Test Page')).toBeInTheDocument();
    });

    it('should render back button with aria-label', () => {
        renderHeader();
        expect(screen.getByLabelText('Назад')).toBeInTheDocument();
    });

    it('should show formatted timer when elapsed is provided', () => {
        renderHeader({ elapsed: 90 });
        expect(screen.getByText('01:30')).toBeInTheDocument();
    });

    it('should NOT show timer when elapsed is not provided', () => {
        const { container } = renderHeader();
        expect(container.querySelector('.timer-badge')).toBeNull();
    });

    it('should render children in header-right area', () => {
        render(
            <MemoryRouter>
                <PageHeader title="T"><span data-testid="child">Child</span></PageHeader>
            </MemoryRouter>
        );
        expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('should apply custom color to title', () => {
        renderHeader({ color: 'red' });
        const title = screen.getByText('Test Page');
        expect(title.style.color).toBeTruthy();
    });
});

// ═══════════════════════════════════════════════════════════
//  SensorCard
// ═══════════════════════════════════════════════════════════

describe('SensorCard', () => {
    it('should render label and formatted value', () => {
        render(<SensorCard label="БОЙЛЕР" value={65.5} color="red" />);
        expect(screen.getByText('БОЙЛЕР')).toBeInTheDocument();
        expect(screen.getByText('65.5°')).toBeInTheDocument();
    });

    it('should show warning color when value exceeds warnAbove', () => {
        const { container } = render(
            <SensorCard label="T" value={100} color="blue" warnAbove={90} />
        );
        const valueEl = container.querySelector('.sensor-card__value');
        expect(valueEl).toHaveStyle({ color: 'var(--accent-red)' });
    });

    it('should use normal color when value is below warnAbove', () => {
        const { container } = render(
            <SensorCard label="T" value={50} color="blue" warnAbove={90} />
        );
        const valueEl = container.querySelector('.sensor-card__value');
        // jsdom converts named colors to rgb; just verify it's not the warning color
        expect(valueEl.style.color).not.toBe('var(--accent-red)');
    });

    it('should apply lg size class when size="lg"', () => {
        const { container } = render(
            <SensorCard label="T" value={20} color="green" size="lg" />
        );
        const valueEl = container.querySelector('.sensor-card__value');
        expect(valueEl.classList.contains('sensor-card__value--lg')).toBe(true);
    });
});

// ═══════════════════════════════════════════════════════════
//  ProcessChart
// ═══════════════════════════════════════════════════════════

describe('ProcessChart', () => {
    const lines = [{ dataKey: 'temp', color: 'red', name: 'Temp' }];

    it('should render chart panel container', () => {
        const { container } = render(<ProcessChart data={[]} lines={lines} />);
        expect(container.querySelector('.chart-panel')).toBeInTheDocument();
    });

    it('should render zoom controls', () => {
        render(<ProcessChart data={[]} lines={lines} />);
        expect(screen.getByText('МАСШТАБ')).toBeInTheDocument();
        expect(screen.getByText('СБРОС')).toBeInTheDocument();
    });

    it('should accept defaultYMin/defaultYMax props without error', () => {
        expect(() =>
            render(<ProcessChart data={[]} lines={lines} defaultYMin={0} defaultYMax={100} />)
        ).not.toThrow();
    });

    it('should render with reference lines', () => {
        const refs = [{ y: 65, color: 'blue', label: 'Target 65°C' }];
        expect(() =>
            render(<ProcessChart data={[]} lines={lines} referenceLines={refs} />)
        ).not.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════
//  PhaseList
// ═══════════════════════════════════════════════════════════

describe('PhaseList', () => {
    const phases = [
        { id: 'heat', name: 'Нагрев', color: '#ff9800', description: '0→65°C' },
        { id: 'mash', name: 'Затирание', color: '#4caf50', description: '65°C · 60 мин' },
        { id: 'out', name: 'Mashout', color: '#03a9f4', description: '78°C · 5 мин' },
    ];

    it('should render all phase names', () => {
        render(<PhaseList title="СТАДИИ" phases={phases} currentIndex={0} isStarted={false} onAdvance={() => { }} />);
        expect(screen.getByText('Нагрев')).toBeInTheDocument();
        expect(screen.getByText('Затирание')).toBeInTheDocument();
        expect(screen.getByText('Mashout')).toBeInTheDocument();
    });

    it('should render title', () => {
        render(<PhaseList title="СТАДИИ" phases={phases} currentIndex={0} isStarted={false} onAdvance={() => { }} />);
        expect(screen.getByText('СТАДИИ')).toBeInTheDocument();
    });

    it('should render descriptions', () => {
        render(<PhaseList title="T" phases={phases} currentIndex={1} isStarted={false} onAdvance={() => { }} />);
        expect(screen.getByText('65°C · 60 мин')).toBeInTheDocument();
    });

    it('should show advance button when started and not on last phase', () => {
        const { container } = render(
            <PhaseList title="T" phases={phases} currentIndex={0} isStarted={true} onAdvance={() => { }} />
        );
        const advBtn = container.querySelector('.btn-advance');
        expect(advBtn).toBeInTheDocument();
        expect(advBtn.textContent).toContain('Затирание');
    });

    it('should NOT show advance button on last phase', () => {
        const { container } = render(
            <PhaseList title="T" phases={phases} currentIndex={2} isStarted={true} onAdvance={() => { }} />
        );
        expect(container.querySelector('.btn-advance')).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════
//  SafetyCheck
// ═══════════════════════════════════════════════════════════

describe('SafetyCheck', () => {
    it('should render hardcoded title and subtitle', () => {
        render(<SafetyCheck checked={false} onChange={() => { }} />);
        expect(screen.getByText('ТЭН покрыт водой')).toBeInTheDocument();
        expect(screen.getByText('Блокировка нагрева без воды')).toBeInTheDocument();
    });

    it('should call onChange when checkbox is clicked', () => {
        const handler = vi.fn();
        render(<SafetyCheck checked={false} onChange={handler} />);
        fireEvent.click(screen.getByRole('checkbox'));
        expect(handler).toHaveBeenCalled();
    });

    it('should reflect checked state', () => {
        render(<SafetyCheck checked={true} onChange={() => { }} />);
        expect(screen.getByRole('checkbox')).toBeChecked();
    });

    it('should apply checked CSS class when checked', () => {
        const { container } = render(<SafetyCheck checked={true} onChange={() => { }} />);
        expect(container.querySelector('.safety-check--checked')).toBeInTheDocument();
    });

    it('should NOT apply checked CSS class when unchecked', () => {
        const { container } = render(<SafetyCheck checked={false} onChange={() => { }} />);
        expect(container.querySelector('.safety-check--checked')).toBeNull();
    });
});

// ═══════════════════════════════════════════════════════════
//  StartButton
// ═══════════════════════════════════════════════════════════

describe('StartButton', () => {
    it('should show default start label when not started', () => {
        render(<StartButton isStarted={false} onClick={() => { }} />);
        expect(screen.getByText('СТАРТ')).toBeInTheDocument();
    });

    it('should show default stop label when started', () => {
        render(<StartButton isStarted={true} onClick={() => { }} />);
        expect(screen.getByText('СТОП')).toBeInTheDocument();
    });

    it('should show custom start label', () => {
        render(<StartButton isStarted={false} onClick={() => { }} startLabel="GO" />);
        expect(screen.getByText('GO')).toBeInTheDocument();
    });

    it('should show custom stop label', () => {
        render(<StartButton isStarted={true} onClick={() => { }} stopLabel="HALT" />);
        expect(screen.getByText('HALT')).toBeInTheDocument();
    });

    it('should call onClick when clicked', () => {
        const handler = vi.fn();
        render(<StartButton isStarted={false} onClick={handler} />);
        fireEvent.click(screen.getByRole('button'));
        expect(handler).toHaveBeenCalledOnce();
    });

    it('should be disabled when disabled prop is true', () => {
        render(<StartButton isStarted={false} onClick={() => { }} disabled={true} />);
        expect(screen.getByRole('button')).toBeDisabled();
    });

    it('should apply stop class when started', () => {
        const { container } = render(<StartButton isStarted={true} onClick={() => { }} />);
        expect(container.querySelector('.btn-start--stop')).toBeInTheDocument();
    });
});
