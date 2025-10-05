# Frontend Testing Guide

This document describes the testing infrastructure for the Ground Station frontend application.

## Testing Stack

- **Vitest** - Fast unit test framework for Vite projects
- **React Testing Library** - Component testing utilities
- **Playwright** - End-to-end testing framework
- **@testing-library/jest-dom** - Custom matchers for DOM assertions
- **@testing-library/user-event** - User interaction simulation

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   └── **/__tests__/        # Component tests
│   └── test/
│       ├── setup.js              # Test environment setup
│       └── test-utils.jsx        # Custom test utilities
├── e2e/                          # E2E tests
│   ├── example.spec.js
│   └── satellite-tracking.spec.js
├── vitest.config.js              # Vitest configuration
└── playwright.config.js          # Playwright configuration
```

## Running Tests

### Unit & Component Tests

```bash
# Run all unit tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with UI
npm run test:ui

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- src/components/common/__tests__/login.test.jsx
```

### End-to-End Tests

```bash
# Run all E2E tests
npm run test:e2e

# Run E2E tests with UI (interactive mode)
npm run test:e2e:ui

# Run E2E tests in debug mode
npm run test:e2e:debug

# Run specific test file
npm run test:e2e -- e2e/satellite-tracking.spec.js

# Run tests for specific browser
npm run test:e2e -- --project=chromium
npm run test:e2e -- --project=firefox
npm run test:e2e -- --project=webkit
```

### Install Playwright Browsers (First Time)

```bash
npx playwright install
```

## Writing Tests

### Component Tests

Create test files in `__tests__` directories next to your components:

```jsx
// src/components/common/__tests__/MyComponent.test.jsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../../test/test-utils';
import MyComponent from '../MyComponent';

describe('MyComponent', () => {
  it('renders correctly', () => {
    renderWithProviders(<MyComponent />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('handles user interaction', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MyComponent />);

    await user.click(screen.getByRole('button'));
    expect(screen.getByText('Clicked')).toBeInTheDocument();
  });
});
```

### Redux Slice Tests

```javascript
// src/components/settings/__tests__/preferences-slice.test.js
import { describe, it, expect } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import preferencesReducer, { updatePreference } from '../preferences-slice';

describe('preferences slice', () => {
  it('updates preference value', () => {
    const store = configureStore({
      reducer: { preferences: preferencesReducer },
    });

    store.dispatch(updatePreference({ key: 'theme', value: 'dark' }));

    expect(store.getState().preferences.theme).toBe('dark');
  });
});
```

### E2E Tests

Create test files in the `e2e` directory:

```javascript
// e2e/my-feature.spec.js
import { test, expect } from '@playwright/test';

test.describe('My Feature', () => {
  test('should work correctly', async ({ page }) => {
    await page.goto('/my-feature');

    await page.click('button[aria-label="Start"]');

    await expect(page.locator('text=Success')).toBeVisible();
  });
});
```

## Test Utilities

### renderWithProviders

Renders a component with Redux, Router, and Theme providers:

```jsx
import { renderWithProviders } from '../../../test/test-utils';

const { store } = renderWithProviders(<MyComponent />, {
  preloadedState: {
    satellites: { list: [] }
  }
});
```

### createMockSocket

Creates a mock Socket.IO client for testing:

```javascript
import { createMockSocket } from '../../../test/test-utils';

const mockSocket = createMockSocket();
mockSocket.emit('connect');
mockSocket.triggerEvent('satellite-tracking', { data: {} });
```

## Mocking

### Mocking Modules

```javascript
import { vi } from 'vitest';

vi.mock('socket.io-client', () => ({
  default: vi.fn(() => mockSocket),
}));
```

### Mocking API Calls

```javascript
import { vi } from 'vitest';

global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: async () => ({ data: 'test' }),
  })
);
```

## Coverage

Coverage reports are generated in the `coverage/` directory:

- **HTML Report**: `coverage/index.html`
- **Text Summary**: Displayed in console
- **LCOV**: `coverage/lcov.info` (for CI/CD)

### Coverage Thresholds

Current thresholds (configured in `vitest.config.js`):
- Lines: 70%
- Functions: 70%
- Branches: 70%
- Statements: 70%

## Best Practices

1. **Test Behavior, Not Implementation**: Focus on what the component does, not how it does it
2. **Use Semantic Queries**: Prefer `getByRole`, `getByLabelText` over `getByTestId`
3. **Avoid Testing Redux Internals**: Test user-facing behavior instead
4. **Mock External Dependencies**: Socket.IO, APIs, browser APIs
5. **Clean Up**: Tests should not affect each other
6. **Async Operations**: Always await async operations
7. **Accessibility**: Use ARIA roles and labels for better testability

## Debugging Tests

### Vitest

```bash
# Run with --inspect-brk flag
node --inspect-brk ./node_modules/vitest/vitest.mjs run

# Then open chrome://inspect in Chrome
```

### Playwright

```bash
# Run in headed mode
npm run test:e2e -- --headed

# Run with Playwright Inspector
npm run test:e2e:debug

# Generate tests with Codegen
npx playwright codegen http://localhost:5173
```

## CI/CD Integration

Tests run automatically on:
- Push to `main` or `develop` branches
- Pull requests to `main` or `develop`

See `.github/workflows/frontend-tests.yml` for CI configuration.

## Troubleshooting

### Tests Failing Locally

1. Clear node_modules and reinstall:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

2. Update Playwright browsers:
   ```bash
   npx playwright install
   ```

3. Check for stale mocks or test state

### E2E Tests Timeout

- Increase timeout in `playwright.config.js`
- Check if backend is running
- Check network conditions
- Verify selectors are correct

### React 19 Compatibility

If you encounter issues with React 19:
- Ensure all testing libraries are up to date
- Check for console warnings about deprecated features
- Review React Testing Library compatibility

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/react)
- [Playwright Documentation](https://playwright.dev/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
