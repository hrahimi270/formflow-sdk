import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/vue';
import { afterEach } from 'vitest';

// Unmount mounted components and reset the DOM between tests so they stay isolated.
afterEach(() => {
  cleanup();
});
