import '@testing-library/jest-dom';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Setup file for Vitest
// Ensures cleanup after each test to prevent memory leaks or side effects
afterEach(() => {
    cleanup();
});
