import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ProcessRecoveryNotice, { requiresProcessAcknowledgement } from './ProcessRecoveryNotice';

const interrupted = { status: 'IDLE', recovery: [{ sessionId: 42, snapshot: { status: 'HEATING' } }] };

describe('ProcessRecoveryNotice', () => {
    it('shows interrupted session while IDLE, never auto-stops, and unlocks start after confirmed stop', async () => {
        const stop = vi.fn().mockResolvedValue({ ok: true, state: { status: 'IDLE', recovery: [], persistenceError: false } });
        function Harness() {
            const [state, setState] = useState(interrupted);
            const acknowledge = async () => { const result = await stop(); setState(result.state); return result; };
            return <><ProcessRecoveryNotice processState={state} onAcknowledge={acknowledge} />
                <button disabled={requiresProcessAcknowledgement(state)}>Новый запуск</button></>;
        }
        render(<Harness />);
        expect(screen.getByText('Сессия 42: Нагрев')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Новый запуск' })).toBeDisabled();
        expect(stop).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Подтвердить остановку' }));
        await waitFor(() => expect(screen.queryByRole('region', { name: 'Подтверждение остановки процесса' })).not.toBeInTheDocument());
        expect(stop).toHaveBeenCalledTimes(1);
        expect(screen.getByRole('button', { name: 'Новый запуск' })).toBeEnabled();
    });

    it('keeps the notice and lets the operator retry when stop fails', async () => {
        const stop = vi.fn().mockRejectedValue(new Error('Сервер недоступен'));
        render(<ProcessRecoveryNotice processState={interrupted} onAcknowledge={stop} />);
        fireEvent.click(screen.getByRole('button', { name: 'Подтвердить остановку' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Сервер недоступен');
        expect(screen.getByText('Сессия 42: Нагрев')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Подтвердить остановку' })).toBeEnabled();
    });

    it('does not hide when stop returns a state whose acknowledgement was not persisted', async () => {
        const state = { status: 'PAUSED', sessionId: 42, persistenceError: true };
        render(<ProcessRecoveryNotice processState={state} onAcknowledge={vi.fn().mockResolvedValue({ ok: true, state })} />);
        fireEvent.click(screen.getByRole('button', { name: 'Подтвердить остановку' }));
        expect(await screen.findByRole('alert')).toHaveTextContent('Подтверждение не сохранено');
        expect(screen.getByText('Сессия 42: На паузе')).toBeInTheDocument();
    });

    it('prevents duplicate acknowledgement while the stop is in flight', async () => {
        let complete;
        const stop = vi.fn(() => new Promise(resolve => { complete = resolve; }));
        render(<ProcessRecoveryNotice processState={interrupted} onAcknowledge={stop} />);
        fireEvent.click(screen.getByRole('button', { name: 'Подтвердить остановку' }));
        expect(screen.getByRole('button', { name: 'Подтверждение…' })).toBeDisabled();
        expect(stop).toHaveBeenCalledTimes(1);
        complete({ state: { recovery: [] } });
        await waitFor(() => expect(screen.getByRole('button', { name: 'Подтвердить остановку' })).toBeEnabled());
    });

    it('renders nothing for an ordinary idle or active run', () => {
        const { container, rerender } = render(<ProcessRecoveryNotice processState={{ status: 'IDLE' }} onAcknowledge={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
        rerender(<ProcessRecoveryNotice processState={{ status: 'HEATING', recovery: [] }} onAcknowledge={vi.fn()} />);
        expect(container).toBeEmptyDOMElement();
    });
});
