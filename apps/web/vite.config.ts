/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
  optimizeDeps: {
    exclude: [
      '@trading-office/office-visual-kit',
      '@trading-office/trading-lab-floor',
    ],
  },
  resolve: {
    dedupe: ['pixi.js', 'pixi-viewport', 'react', 'react-dom'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
