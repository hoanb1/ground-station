/**
 * Example test for Socket context
 */

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSocket, SocketProvider } from '../socket';

// Create mock Manager class
class MockManager {
  constructor(url, options) {
    this.url = url;
    this.options = options;
  }

  socket(namespace) {
    const mockSocket = {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
      connect: vi.fn(),
      disconnect: vi.fn(),
      connected: true,
      id: 'test-socket-id',
    };
    return mockSocket;
  }
}

// Mock socket.io-client with Manager
vi.mock('socket.io-client', () => ({
  Manager: MockManager,
  io: vi.fn(),
}));

describe('SocketProvider', () => {
  it('provides socket instance to children', () => {
    const wrapper = ({ children }) => (
      <SocketProvider>{children}</SocketProvider>
    );

    const { result } = renderHook(() => useSocket(), { wrapper });

    expect(result.current.socket).toBeDefined();
  });

  it('socket can emit events', () => {
    const wrapper = ({ children }) => (
      <SocketProvider>{children}</SocketProvider>
    );

    const { result } = renderHook(() => useSocket(), { wrapper });

    result.current.socket.emit('test-event', { data: 'test' });

    expect(result.current.socket.emit).toHaveBeenCalledWith('test-event', {
      data: 'test',
    });
  });
});
