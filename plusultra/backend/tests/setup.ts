// Mock environment variables for testing
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';

// Global test setup
beforeAll(async () => {
  // Setup test database or mocking
  console.log('🧪 Setting up test environment...');
});

afterAll(async () => {
  // Cleanup test environment
  console.log('🧹 Cleaning up test environment...');
});

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
