import { useState } from 'react';

export function requiresProcessAcknowledgement(state) {
    return !!(state?.recovery?.length || state?.persistenceError || state?.recoveryRequired);
}

const statusLabels = {
    START_REQUESTED: 'Запуск не завершён', HEATING: 'Нагрев', HOLDING: 'Температурная пауза',
    PAUSED: 'На паузе', COMPLETED: 'Завершён', START_FAILED: 'Ошибка запуска',
};

/** Acknowledgement uses the ordinary stop command. This component never resumes a run. */
export default function ProcessRecoveryNotice({ processState, onAcknowledge, isLoading = false }) {
    const [isAcknowledging, setAcknowledging] = useState(false);
    const [error, setError] = useState(null);
    if (!requiresProcessAcknowledgement(processState)) return null;
    const sessions = processState.recovery?.length ? processState.recovery
        : processState.sessionId ? [{ sessionId: processState.sessionId, snapshot: processState }] : [];
    async function acknowledge() {
        setAcknowledging(true);
        setError(null);
        try {
            const result = await onAcknowledge();
            if (requiresProcessAcknowledgement(result?.state)) {
                setError('Подтверждение не сохранено. Повторите попытку после восстановления соединения.');
            }
        } catch (failure) {
            setError(failure.message || 'Не удалось подтвердить остановку. Повторите попытку.');
        } finally { setAcknowledging(false); }
    }
    return (
        <section className="industrial-panel" aria-label="Подтверждение остановки процесса"
            style={{ padding: '1.25rem', marginBottom: '1rem', borderColor: 'var(--accent-orange)', display: 'grid', gap: '0.75rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Процесс требует подтверждения</h2>
            <p style={{ margin: 0 }}>Предыдущее действие не завершено или не сохранено. Автоматическое возобновление отключено.
                Проверьте состояние оборудования и подтвердите остановку перед новым запуском.</p>
            {sessions.length > 0 && <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
                {sessions.map(item => <li key={item.sessionId}>Сессия {item.sessionId}: {statusLabels[item.snapshot?.status] || 'Состояние требует проверки'}</li>)}
            </ul>}
            {error && <p role="alert" style={{ margin: 0, color: 'var(--accent-red)' }}>{error}</p>}
            <button type="button" className="btn btn-secondary" onClick={acknowledge} disabled={isLoading || isAcknowledging}>
                {isAcknowledging ? 'Подтверждение…' : 'Подтвердить остановку'}
            </button>
        </section>
    );
}
