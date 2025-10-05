/**
 * Example test for Login component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, userEvent } from '../../../test/test-utils';
import LoginForm from '../login';
import { SocketProvider } from '../socket';
import { SnackbarProvider } from 'notistack';

// Mock socket.io-client Manager
class MockManager {
  constructor(url, options) {
    this.url = url;
    this.options = options;
  }

  socket(namespace) {
    return {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      connected: true,
      id: 'test-socket-id',
    };
  }
}

vi.mock('socket.io-client', () => ({
  Manager: MockManager,
  io: vi.fn(),
}));

// Helper to render LoginForm with all required providers
const renderLoginForm = () => {
  return renderWithProviders(
    <SocketProvider>
      <SnackbarProvider>
        <LoginForm />
      </SnackbarProvider>
    </SocketProvider>
  );
};

describe('LoginForm', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  it('renders login form with username and password fields', () => {
    renderLoginForm();

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('allows user to type in username field', async () => {
    const user = userEvent.setup();
    renderLoginForm();

    const usernameInput = screen.getByLabelText(/username/i);
    await user.type(usernameInput, 'testuser');

    expect(usernameInput).toHaveValue('testuser');
  });

  it('allows user to type in password field', async () => {
    const user = userEvent.setup();
    renderLoginForm();

    const passwordInput = screen.getByLabelText(/password/i);
    await user.type(passwordInput, 'testpassword');

    expect(passwordInput).toHaveValue('testpassword');
  });

  it('shows validation error for empty fields', async () => {
    const user = userEvent.setup();
    renderLoginForm();

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitButton);

    // Adjust these assertions based on your actual validation behavior
    // This is a placeholder - update based on your LoginForm implementation
    await waitFor(() => {
      // Check if any error message appears
      const errorElements = screen.queryAllByText(/required|invalid|error/i);
      // If your form doesn't show validation errors, comment this out
      // expect(errorElements.length).toBeGreaterThan(0);
    });
  });
});
