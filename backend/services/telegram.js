/**
 * Telegram Notification Module
 *
 * Sends notifications to a Telegram chat via the Bot API.
 * Supports: phase changes, temperature alerts, process completion,
 * and periodic status reports.
 */

import { settingsQueries } from '../db/database.js';
import logger from '../utils/logger.js';

const log = logger.child({ module: 'Telegram' });

// ─── State ───────────────────────────────────────────────

let botToken = process.env.TELEGRAM_BOT_TOKEN || '';
let chatId = process.env.TELEGRAM_CHAT_ID || '';
let enabled = false;
let periodicInterval = null;
let lastSensorData = null;
let lastControlState = null;
let currentProcessType = null; // 'mash', 'boil', 'fermentation', etc.

// ─── Core Send ───────────────────────────────────────────

/**
 * Send a text message via the Telegram Bot API.
 * @param {string} text  — message text (supports Markdown)
 * @param {object} [opts] — optional overrides for parse_mode, disable_notification
 * @returns {Promise<object|null>}
 */
export async function sendMessage(text, opts = {}) {
    if (!botToken || !chatId) {
        log.warn('Skip send: botToken or chatId missing');
        return { ok: false, description: 'Telegram не настроен (отсутствует токен или Chat ID)' };
    }
    if (!enabled) {
        log.warn('Skip send: service disabled');
        return { ok: false, description: 'Telegram уведомления отключены в настройках' };
    }

    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: opts.parse_mode || 'Markdown',
                disable_notification: opts.silent || false,
            }),
        });
        const data = await res.json();
        if (!data.ok) {
            log.error({ apiError: data.description }, 'API error');
        } else {
            log.debug('Message sent');
        }
        return data;
    } catch (err) {
        log.error({ err }, 'Send failed');
        return { ok: false, description: `Ошибка сети: ${err.message}` };
    }
}

// ─── High-Level Notification Helpers ─────────────────────

/**
 * Notify on phase/step change.
 * e.g. "Mash step 2: Осахаривание 67°C"
 */
export function notifyPhaseChange(processType, phaseName, details = '') {
    const config = getConfig();
    if (!config.notifyPhaseChange) {
        log.debug('Phase change notify disabled');
        return;
    }

    const emoji = {
        mash: '🌡', boil: '🔥', fermentation: '🫧',
        distillation: '💧', rectification: '⚗️'
    }[processType] || '📋';

    const msg = `${emoji} *Смена фазы*\n\nПроцесс: *${processType}*\nФаза: *${phaseName}*${details ? `\n${details}` : ''}`;
    log.info({ phase: phaseName }, 'notifyPhaseChange');
    return sendMessage(msg);
}

/**
 * Notify on critical temperature alert.
 * @param {string} sensor — sensor name
 * @param {number} temp — current value
 * @param {number} threshold — limit exceeded
 */
export function notifyTempAlert(sensor, temp, threshold) {
    const config = getConfig();
    if (!config.notifyTempAlert) return;

    const msg = `🚨 *Температурный алерт!*\n\nДатчик: *${sensor}*\nТемпература: *${temp.toFixed(1)}°C*\nПорог: *${threshold}°C*\n\n⚠️ Требуется внимание!`;
    return sendMessage(msg);
}

/**
 * Notify when a process completes.
 * @param {string} processType — mash | boil | fermentation | ...
 * @param {object} [summary] — optional stats
 */
export function notifyComplete(processType, summary = {}) {
    const config = getConfig();
    if (!config.notifyComplete) return;

    let details = '';
    if (summary.duration) details += `\nДлительность: *${summary.duration}*`;
    if (summary.volume) details += `\nОбъём: *${summary.volume}л*`;
    if (summary.notes) details += `\n📝 ${summary.notes}`;

    const msg = `✅ *Процесс завершён*\n\nТип: *${processType}*${details}`;
    currentProcessType = null; // Reset context
    return sendMessage(msg);
}

/**
 * Send a periodic status report with current sensor data.
 */
export function sendStatusReport() {
    const s = lastSensorData || {};
    const c = lastControlState || {};

    // If it's mash or boil, we don't show all distillation sensors
    const isBrewing = ['mash', 'boil', 'brew'].includes(currentProcessType);

    log.debug({ processType: currentProcessType, isBrewing }, 'Generating report');

    // Safety: ensure we have numbers (handle both layouts: { boiler: 20 } and { boiler: { value: 20 } })
    const getVal = (val) => {
        if (typeof val === 'number') return val;
        if (val && typeof val.value === 'number') return val.value;
        return null;
    };

    const boilerTemp = getVal(s.boiler);

    const msg = [
        '📊 *Периодический отчёт*',
        '',
        `🌡 Куб: *${boilerTemp?.toFixed(1) ?? '—'}°C*`,
    ];

    if (!isBrewing) {
        msg.push(`🌡 Колонна: *${getVal(s.column)?.toFixed(1) ?? '—'}°C*`);
        msg.push(`🌡 Дефлегматор: *${getVal(s.dephleg)?.toFixed(1) ?? '—'}°C*`);
        msg.push(`🌡 Выход: *${getVal(s.output)?.toFixed(1) ?? '—'}°C*`);
    }

    msg.push('');
    msg.push(`🔥 ТЭН: *${c.heater ?? 0}%*`);

    if (!isBrewing) {
        msg.push(`❄️ Охлаждение: *${c.cooler ?? 0}%*`);
    } else if (global._latestProcessState) {
        // Brew process active info
        const ps = global._latestProcessState;
        if (ps.status === 'HOLDING' || ps.status === 'HEATING') {
            const phaseStr = ps.stepPhase === 'holding' ? 'Удержание' : 'Нагрев';
            const stepName = ps.currentStep?.name || '—';
            const timeStr = ps.remainingTime ? `${Math.floor(ps.remainingTime / 60)}:${String(ps.remainingTime % 60).padStart(2, '0')}` : '—';

            msg.push(`⏳ Этап: *${stepName}* (${phaseStr})`);
            if (ps.stepPhase === 'holding') {
                msg.push(`Осталось: *${timeStr}*`);
            }
        } else if (ps.status !== 'IDLE' && ps.status !== 'COMPLETED') {
            msg.push(`ℹ️ Статус: *${ps.status}*`);
        }
    }

    msg.push(`💧 Насос: *${c.pump ? 'ВКЛ' : 'ВЫКЛ'}*`);

    return sendMessage(msg.join('\n'), { silent: true });
}

/**
 * Notify on pump state change.
 */
export function notifyPumpChange(isOn) {
    const msg = isOn ? '💧 *Насос включен*' : '🛑 *Насос выключен*';
    return sendMessage(msg);
}

/**
 * Notify on mash step events.
 * @param {string} type — 'reached' | 'completed'
 * @param {object} step — { name, temp, duration }
 */
export function notifyMashStep(type, step) {
    let msg = '';
    if (type === 'reached') {
        msg = `🌡 *Температура паузы достигнута*\n\nПауза: *${step.name}*\nЦель: *${step.temp}°C*\nНачинаем отсчёт *${step.duration} мин*`;
    } else if (type === 'completed') {
        msg = `✅ *Температурная пауза завершена*\n\nПауза: *${step.name}* завершена.`;
    }
    return sendMessage(msg);
}

/**
 * Notify on boiling milestones and reminders.
 */
export function notifyBoilMilestone(type, details = '') {
    const icons = {
        start: '🔥',
        hop: '🌿',
        reminder: '⏳',
        complete: '✅'
    };
    const emoji = icons[type] || '🔔';
    const msg = `${emoji} *Уведомление варки*\n\n${details}`;
    log.info({ type }, 'notifyBoilMilestone');
    return sendMessage(msg);
}

export function updateSensorData(sensors) {
    if (!sensors) return;
    // Only update if it contains sensor data (type 'sensors' or has 'boiler' field)
    if (sensors.type === 'sensors' || sensors.boiler !== undefined) {
        const { type, timestamp, ...rest } = sensors;
        lastSensorData = rest;
    }
}

export function updateControlState(control) {
    if (!control) return;
    // Only update if it contains control data (type 'control' or has 'heater' field)
    if (control.type === 'control' || control.heater !== undefined) {
        const { type, timestamp, ...rest } = control;
        lastControlState = rest;
    }
}

export function setCurrentProcessType(type) {
    log.info({ type }, 'Process type set');
    currentProcessType = type;
}

// ─── Config ──────────────────────────────────────────────

function getConfig() {
    try {
        const stored = settingsQueries.get('telegram');
        return {
            enabled: false,
            notifyPhaseChange: true,
            notifyTempAlert: true,
            notifyComplete: true,
            notifyInterval: 5,
            ...stored,
        };
    } catch {
        return {
            enabled: false,
            notifyPhaseChange: true,
            notifyTempAlert: true,
            notifyComplete: true,
            notifyInterval: 5,
        };
    }
}

// ─── Init / Shutdown ─────────────────────────────────────

/**
 * Initialize the Telegram module. Reads config from DB and env vars.
 */
export function initTelegram() {
    try {
        const config = getConfig();

        // Env vars take precedence, then DB config
        botToken = process.env.TELEGRAM_BOT_TOKEN || config.botToken || '';
        chatId = process.env.TELEGRAM_CHAT_ID || config.chatId || '';
        enabled = config.enabled && !!botToken && !!chatId;

        log.info({ enabled, hasToken: !!botToken, chatId: chatId || 'none' }, 'Init');

        if (!enabled) {
            log.info('Service disabled or missing credentials');
            return;
        }

        log.info('Initialized OK');

        // Start periodic reports
        const intervalMin = config.notifyInterval || 5;
        if (intervalMin > 0) {
            if (periodicInterval) clearInterval(periodicInterval);
            periodicInterval = setInterval(sendStatusReport, intervalMin * 60 * 1000);
            log.info({ intervalMin }, 'Periodic reports started');
        }

        // Send startup message
        sendMessage('🟢 *OrangeBrew запущен*\n\nСистема готова к работе.');
    } catch (err) {
        log.error({ err }, 'Initialization failed');
    }
}

/**
 * Shut down the Telegram module.
 */
export function shutdownTelegram() {
    if (periodicInterval) {
        clearInterval(periodicInterval);
        periodicInterval = null;
    }
    if (enabled) {
        sendMessage('🔴 *OrangeBrew остановлен*');
    }
    enabled = false;
}

/**
 * Reload credentials from the DB (call after settings change).
 */
export function reloadTelegramConfig() {
    shutdownTelegram();
    initTelegram();
}

export default {
    sendMessage,
    notifyPhaseChange,
    notifyTempAlert,
    notifyComplete,
    notifyPumpChange,
    notifyMashStep,
    notifyBoilMilestone,
    sendStatusReport,
    updateSensorData,
    updateControlState,
    setCurrentProcessType,
    initTelegram,
    shutdownTelegram,
    reloadTelegramConfig,
};
