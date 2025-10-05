# Testing Quick Start Guide

Get up and running with tests in 5 minutes! 🚀

## 1. Install Dependencies

```bash
cd frontend
npm install
```

## 2. Install Playwright Browsers (First Time Only)

```bash
npx playwright install
```

## 3. Run Your First Tests

### Unit Tests

```bash
# Run all tests
npm test

# Watch mode (auto-rerun on file changes)
npm test -- --watch

# With UI (recommended for development)
npm run test:ui
```

### E2E Tests

```bash
# Make sure your dev server is running first
npm run dev

# In another terminal:
npm run test:e2e

# Or run with interactive UI
npm run test:e2e:ui
```

## 4. Check Coverage

```bash
npm run test:coverage

# Open the HTML report
open coverage/index.html  # macOS
xdg-open coverage/index.html  # Linux
start coverage/index.html  # Windows
```

## 5. Writing Your First Test

Create a test file next to your component:

```jsx
// src/components/MySatellite/__tests__/MySatellite.test.jsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../../test/test-utils';
import MySatellite from '../MySatellite';

describe('MySatellite', () => {
  it('displays satellite name', () => {
    renderWithProviders(
      <MySatellite name="ISS" />
    );

    expect(screen.getByText('ISS')).toBeInTheDocument();
  });
});
```

Run it:

```bash
npm test -- MySatellite.test.jsx
```

## 6. Common Testing Patterns

### Testing Redux-Connected Components

```jsx
import { renderWithProviders } from '../../../test/test-utils';

const { store } = renderWithProviders(<MyComponent />, {
  preloadedState: {
    satellites: {
      selected: 'ISS',
      list: [{ id: 1, name: 'ISS' }]
    }
  }
});
```

### Testing User Interactions

```jsx
import { userEvent } from '../../../test/test-utils';

const user = userEvent.setup();
await user.click(screen.getByRole('button'));
await user.type(screen.getByLabelText('Search'), 'satellite');
```

### Testing Async Operations

```jsx
import { waitFor } from '@testing-library/react';

await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
});
```

## 7. Debugging Tests

### Debug in Browser (Vitest)

```bash
npm run test:ui
```

Then click on any test to see detailed execution.

### Debug E2E Tests

```bash
# Run in headed mode (see the browser)
npm run test:e2e -- --headed

# Or use the inspector
npm run test:e2e:debug
```

## 8. Next Steps

- Read the full [TESTING.md](./TESTING.md) guide
- Check out example tests in `src/components/common/__tests__/`
- Look at E2E examples in `e2e/`
- Learn more at [Vitest Docs](https://vitest.dev/) and [Playwright Docs](https://playwright.dev/)

## Troubleshooting

**Tests not running?**
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
```

**E2E tests failing?**
```bash
# Reinstall Playwright browsers
npx playwright install --with-deps
```

**React 19 warnings?**
- This is normal during the RC phase
- Tests should still work correctly
- Update @testing-library/react when React 19 stable is released

## Quick Reference

| Command | Description |
|---------|-------------|
| `npm test` | Run unit tests |
| `npm run test:ui` | Run tests with UI |
| `npm run test:coverage` | Run with coverage |
| `npm run test:e2e` | Run E2E tests |
| `npm run test:e2e:ui` | Run E2E with UI |

Happy Testing! 🧪✨
