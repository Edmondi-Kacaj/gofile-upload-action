import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  clearMocks: true,
  testMatch: ['**/__tests__/**/*.test.ts'],
  verbose: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/main.ts' // main is mostly orchestration + side-effects
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'clover']
};

export default config;
