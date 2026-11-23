/** Per-user Telegram settings and context. No global recipient or process data. */
import { getDb, userQueries, sessionQueries } from '../db/database.js';
import logger from '../utils/logger.js';
import { notificationDelivery } from './notificationDelivery.js';

const log = logger.child({ module: 'Telegram' });
const contexts = new Map();
const intervals = new Map();
const inFlight = new Set();
const requests = new Set();
let shuttingDown = false;
const validUser = userId => Number.isSafeInteger(userId) && userId > 0;

function context(userId) {
    if (!validUser(userId)) return null;
    if (!contexts.has(userId)) contexts.set(userId, {});
    return contexts.get(userId);
}

export function getTelegramConfig(userId) {
    const defaults = { enabled: false, notifyPhaseChange: true, notifyTempAlert: true, notifyComplete: true, notifyInterval: 5 };
    if (!validUser(userId)) return defaults;
    // Read the user's row, without inheriting global credentials via settingsQueries.
    const row = getDb().prepare("SELECT value FROM settings_v2 WHERE key='telegram' AND user_id=?").get(userId);
    let stored = {};
    try { stored = row ? JSON.parse(row.value) : {}; } catch { /* invalid config stays disabled */ }
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) stored = {};
    const result = { ...defaults, ...stored };
    if (Number(process.env.TELEGRAM_OWNER_USER_ID) === userId) {
        result.botToken = process.env.TELEGRAM_BOT_TOKEN || result.botToken;
        result.chatId = process.env.TELEGRAM_CHAT_ID || result.chatId;
    }
    return result;
}

export async function sendMessage(text, opts = {}) {
    const { userId } = opts;
    if (shuttingDown || !validUser(userId) || !userQueries.getById(userId)) {
        return { ok: false, skipped: true, description: 'Получатель уведомления не задан' };
    }
    const config = getTelegramConfig(userId);
    if (!config.enabled || !config.botToken || !config.chatId) {
        return { ok: false, skipped: true, description: 'Telegram не настроен или отключён' };
    }
    const controller = new AbortController();
    requests.add(controller);
    const task = (async () => {
        try {
            const response = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]),
                body: JSON.stringify({ chat_id: config.chatId, text: String(text).slice(0, 4000),
                    ...(opts.parse_mode ? { parse_mode: opts.parse_mode } : {}), disable_notification: !!opts.silent }),
            });
            const data = await response.json();
            if (!response.ok || !data.ok) {
                log.warn({ userId, statusCode: response.status }, 'Telegram delivery rejected');
                return { ok: false, retryable: response.status === 429 || response.status >= 500,
                    retryAfter: Math.min(Number(data.parameters?.retry_after) || 0, 300), description: 'Telegram отклонил сообщение' };
            }
            log.debug({ userId }, 'Telegram message delivered');
            return { ok: true };
        } catch {
            // Never log a fetch error that may contain the credential-bearing URL.
            log.warn({ userId }, 'Telegram delivery failed or timed out');
            return { ok: false, retryable: true, description: 'Не удалось связаться с Telegram' };
        }
    })();
    inFlight.add(task);
    try { return await task; } finally { inFlight.delete(task); requests.delete(controller); }
}

export function setCurrentProcessType(type, userId) {
    const state = context(userId);
    if (state) state.processType = type;
}
export function updateSensorData(data, userId) {
    const state = context(userId);
    if (state && data) state.sensors = data;
}
export function updateControlState(data, userId) {
    const state = context(userId);
    if (state && data) state.control = data;
}
export function updateProcessState(data, userId) {
    const state = context(userId);
    if (state) { state.process = data; state.processType = data?.mode; }
}

export function notifyPhaseChange(type, name, details = '', userId) {
    if (!getTelegramConfig(userId).notifyPhaseChange) return Promise.resolve({ ok: false, skipped: true });
    return sendMessage(`Смена фазы\nПроцесс: ${type}\nФаза: ${name}\n${details}`, { userId });
}
export function notifyTempAlert(sensor, temp, threshold, userId) {
    if (!getTelegramConfig(userId).notifyTempAlert) return Promise.resolve({ ok: false, skipped: true });
    return sendMessage(`Температурный алерт\nДатчик: ${sensor}\nТемпература: ${temp}°C\nПорог: ${threshold}°C`, { userId });
}
export function notifyComplete(type, summary = {}, userId) {
    if (!getTelegramConfig(userId).notifyComplete) return Promise.resolve({ ok: false, skipped: true });
    setCurrentProcessType(null, userId);
    return sendMessage(`Процесс завершён\nТип: ${type}\n${summary.notes || ''}`, { userId });
}
export function notifyPumpChange(isOn, userId) {
    return sendMessage(isOn ? 'Насос включён' : 'Насос выключен', { userId });
}
export function notifyMashStep(type, step = {}, userId) {
    return sendMessage(`${type === 'reached' ? 'Температура паузы достигнута' : 'Пауза завершена'}\n${step.name || ''}\n${step.temp ?? ''}°C`, { userId });
}
export function notifyBoilMilestone(type, details = '', userId) {
    return sendMessage(`Уведомление варки: ${type}\n${typeof details === 'string' ? details : JSON.stringify(details)}`, { userId });
}

export function sendStatusReport(userId) {
    const state = context(userId);
    if (!state) return Promise.resolve({ ok: false, skipped: true });
    const temperature = typeof state.sensors?.boiler === 'number' ? state.sensors.boiler : state.sensors?.boiler?.value;
    return sendMessage(`Периодический отчёт\nТемпература: ${temperature ?? '—'}°C\nПроцесс: ${state.processType || '—'}\nЭтап: ${state.process?.currentStep?.name || '—'}\nНасос: ${state.control?.pump ? 'ВКЛ' : 'ВЫКЛ'}`, { userId, silent: true });
}

const eventLabels = {
    'process.started': 'Процесс запущен', 'process.start_failed': 'Не удалось запустить процесс',
    'process.paused': 'Процесс на паузе', 'process.resumed': 'Процесс возобновлён',
    'process.step_reached': 'Целевая температура достигнута', 'process.step_changed': 'Следующий этап процесса',
    'process.completed': 'Процесс завершён', 'process.stopped': 'Процесс остановлен',
    'process.safety_stop': 'Аварийная остановка',
};

async function deliverProcessEvent(event, { source = 'direct', now = Date.now() } = {}) {
    if (shuttingDown) return { ok: false, retryable: true, description: 'Notification service stopping' };
    if (!event || !eventLabels[event.eventType]) return { ok: true, skipped: true };
    if (source !== (process.env.NOTIFICATIONS_TRANSPORT || 'direct')) return { ok: true, deferred: true };
    const { eventId, userId } = event;
    if (!validUser(userId) || !userQueries.getById(userId)) return { ok: true, skipped: true };
    if (!sessionQueries.getById(event.sessionId, userId)) {
        return { ok: false, retryable: false, description: 'Notification session owner mismatch' };
    }
    const claim = notificationDelivery.claim(eventId, userId, now);
    if (claim === 'done') return { ok: true, duplicate: true };
    if (claim === 'busy') return { ok: false, retryable: true, description: 'Notification already in flight' };
    const age = now - Date.parse(event.occurredAt);
    const ttl = Number(process.env.NOTIFICATION_TTL_MS || 900000);
    const config = getTelegramConfig(userId);
    const enabledType = event.eventType === 'process.completed' ? config.notifyComplete : config.notifyPhaseChange;
    if (!Number.isFinite(age) || age > ttl || age < -60000 || !enabledType) {
        notificationDelivery.finish(eventId, 'skipped', now);
        return { ok: true, skipped: true };
    }
    const state = event.payload?.snapshot || event.payload?.state || event.payload || {};
    const step = state.currentStep || state.steps?.[state.currentStepIndex];
    const result = await sendMessage(`${eventLabels[event.eventType]}\nСессия: ${event.sessionId}\n${step?.name || ''}`, { userId });
    notificationDelivery.finish(eventId, result.ok ? 'sent' : result.skipped ? 'skipped' : 'failed');
    if (result.skipped) return { ok: true, skipped: true };
    return result;
}

export function notifyProcessEvent(event, options) {
    const task = deliverProcessEvent(event, options);
    inFlight.add(task);
    void task.finally(() => inFlight.delete(task)).catch(() => {});
    return task;
}

export function initTelegram(userId) {
    shuttingDown = false;
    const users = validUser(userId) ? [{ id: userId }] : userQueries.getAll();
    for (const user of users) {
        const old = intervals.get(user.id);
        if (old) clearInterval(old);
        intervals.delete(user.id);
        const config = getTelegramConfig(user.id);
        const minutes = Number(config.notifyInterval);
        if (!config.enabled || !config.botToken || !config.chatId || !Number.isFinite(minutes) || minutes <= 0) continue;
        const timer = setInterval(() => { void sendStatusReport(user.id).catch(() => {}); }, Math.min(1440, Math.max(1, minutes)) * 60000);
        timer.unref?.();
        intervals.set(user.id, timer);
    }
    log.info({ configuredUsers: intervals.size }, 'Per-user Telegram notifications initialized');
}
export function reloadTelegramConfig(userId) { initTelegram(userId); }
export async function shutdownTelegram({ timeoutMs = 1000 } = {}) {
    shuttingDown = true;
    for (const request of requests) request.abort();
    for (const timer of intervals.values()) clearInterval(timer);
    intervals.clear();
    contexts.clear();
    let timeout;
    try { await Promise.race([Promise.allSettled([...inFlight]), new Promise(resolve => { timeout = setTimeout(resolve, timeoutMs); })]); }
    finally { clearTimeout(timeout); }
}

export default { sendMessage, notifyPhaseChange, notifyTempAlert, notifyComplete, notifyPumpChange,
    notifyMashStep, notifyBoilMilestone, notifyProcessEvent, sendStatusReport, updateSensorData,
    updateControlState, updateProcessState, setCurrentProcessType, initTelegram, shutdownTelegram, reloadTelegramConfig };
