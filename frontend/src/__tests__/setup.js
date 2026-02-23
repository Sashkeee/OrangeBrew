import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Recharts ResponsiveContainer to avoid width/height warnings in tests
vi.mock('recharts', async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original,
        ResponsiveContainer: ({ children }) => (
            <div style={{ width: '100%', height: '100%' }}>{children}</div>
        ),
    };
});
