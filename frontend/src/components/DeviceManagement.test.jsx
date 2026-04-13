import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DeviceManagement from './DeviceManagement';

// Mock deviceApi
vi.mock('../api/client', () => ({
    deviceApi: {
        getAll: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    }
}));

import { deviceApi } from '../api/client';

describe('DeviceManagement', () => {
    const sampleDevice = {
        id: 'esp32_abc',
        name: 'My ESP',
        role: 'main',
        status: 'online',
        last_seen: '2026-02-26T12:00:00Z'
    };

    const offlineDevice = {
        id: 'esp32_def',
        name: 'Second ESP',
        role: 'aux',
        status: 'offline',
        last_seen: '2026-02-26T11:00:00Z'
    };

    beforeEach(() => {
        vi.clearAllMocks();
        // Default: always return empty unless overridden
        deviceApi.getAll.mockResolvedValue([]);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('shows empty state when no devices found', async () => {
        deviceApi.getAll.mockResolvedValue([]);
        render(<MemoryRouter><DeviceManagement /></MemoryRouter>);

        await waitFor(() => {
            expect(screen.getByText('Нет зарегистрированных устройств')).toBeInTheDocument();
        });
        expect(screen.getByText(/Подключите ESP32 к WiFi-сети/)).toBeInTheDocument();
    });

    it('displays devices with correct online/offline status', async () => {
        deviceApi.getAll.mockResolvedValue([sampleDevice, offlineDevice]);
        render(<MemoryRouter><DeviceManagement /></MemoryRouter>);

        await waitFor(() => {
            expect(screen.getByText('My ESP')).toBeInTheDocument();
        });
        expect(screen.getByText('Second ESP')).toBeInTheDocument();
        expect(screen.getByText('в сети')).toBeInTheDocument();
        expect(screen.getByText('не в сети')).toBeInTheDocument();
    });

    it('shows online count in header', async () => {
        deviceApi.getAll.mockResolvedValue([sampleDevice, offlineDevice]);
        render(<MemoryRouter><DeviceManagement /></MemoryRouter>);

        await waitFor(() => {
            expect(screen.getByText('1 из 2 в сети')).toBeInTheDocument();
        });
    });

    it('handles delete with confirmation dialog', async () => {
        deviceApi.getAll.mockResolvedValue([sampleDevice]);
        deviceApi.delete.mockResolvedValue({ success: true });
        window.confirm = vi.fn(() => true);

        render(<MemoryRouter><DeviceManagement /></MemoryRouter>);

        await waitFor(() => {
            expect(screen.getByText('My ESP')).toBeInTheDocument();
        });

        const deleteBtn = screen.getByTitle('Забыть устройство');
        fireEvent.click(deleteBtn);

        expect(window.confirm).toHaveBeenCalledWith(
            expect.stringContaining('Забыть устройство "My ESP"')
        );
        expect(deviceApi.delete).toHaveBeenCalledWith('esp32_abc');
    });

    it('cancels delete when user declines confirmation', async () => {
        deviceApi.getAll.mockResolvedValue([sampleDevice]);
        window.confirm = vi.fn(() => false);

        render(<MemoryRouter><DeviceManagement /></MemoryRouter>);

        await waitFor(() => {
            expect(screen.getByText('My ESP')).toBeInTheDocument();
        });

        const deleteBtn = screen.getByTitle('Забыть устройство');
        fireEvent.click(deleteBtn);

        expect(window.confirm).toHaveBeenCalled();
        expect(deviceApi.delete).not.toHaveBeenCalled();
    });

    it('shows error message when API fails', async () => {
        deviceApi.getAll.mockRejectedValue(new Error('Network error'));

        render(<MemoryRouter><DeviceManagement /></MemoryRouter>);

        await waitFor(() => {
            expect(screen.getByText('Не удалось загрузить список устройств')).toBeInTheDocument();
        });
    });

    it('has a refresh button', async () => {
        deviceApi.getAll.mockResolvedValue([sampleDevice]);
        render(<MemoryRouter><DeviceManagement /></MemoryRouter>);

        await waitFor(() => {
            expect(screen.getByText('My ESP')).toBeInTheDocument();
        });

        const refreshBtn = screen.getByText('Обновить');
        expect(refreshBtn).toBeInTheDocument();

        // Click it
        fireEvent.click(refreshBtn);
        // Should trigger another fetch
        await waitFor(() => {
            expect(deviceApi.getAll.mock.calls.length).toBeGreaterThanOrEqual(2);
        });
    });

    it('enters rename mode on edit button click', async () => {
        deviceApi.getAll.mockResolvedValue([sampleDevice]);
        deviceApi.update.mockResolvedValue({ success: true });

        render(<MemoryRouter><DeviceManagement /></MemoryRouter>);

        await waitFor(() => {
            expect(screen.getByText('My ESP')).toBeInTheDocument();
        });

        // Click edit button near device name
        const deviceNameEl = screen.getByText('My ESP');
        const editBtn = deviceNameEl.closest('div').querySelector('button');
        fireEvent.click(editBtn);

        // Input should appear with current name
        const input = screen.getByDisplayValue('My ESP');
        expect(input).toBeInTheDocument();

        // Type new name and submit
        fireEvent.change(input, { target: { value: 'Renamed ESP' } });
        fireEvent.keyDown(input, { key: 'Enter' });

        await waitFor(() => {
            expect(deviceApi.update).toHaveBeenCalledWith('esp32_abc', { name: 'Renamed ESP' });
        });
    });

    it('shows device ID and role info', async () => {
        deviceApi.getAll.mockResolvedValue([sampleDevice]);
        render(<MemoryRouter><DeviceManagement /></MemoryRouter>);

        await waitFor(() => {
            expect(screen.getByText(/ID: esp32_abc/)).toBeInTheDocument();
            expect(screen.getByText(/Роль: main/)).toBeInTheDocument();
        });
    });
});
