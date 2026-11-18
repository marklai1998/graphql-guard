const { resolve } = require('node:path');
const CI = !!process.env.CI;

const ROOT_DIR = __dirname;

module.exports = {
  testEnvironment: 'node',
  rootDir: ROOT_DIR,
  restoreMocks: true,
  reporters: ['default'],
  modulePathIgnorePatterns: [
    '<rootDir>/dist',
    '<rootDir>/examples',
    'test-assets',
    'test-files',
    'fixtures',
    '.bob',
  ],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '.bob/'],
  collectCoverage: false,
  cacheDirectory: resolve(ROOT_DIR, `${CI ? '' : 'node_modules/'}.cache/jest`),
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  globals: {
    'ts-jest': {
      tsconfig: resolve(ROOT_DIR, 'tsconfig.json'),
      isolatedModules: true,
    },
  },
  resolver: 'bob-the-bundler/jest-resolver.js',
};
