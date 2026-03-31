/**
 * WebSocket Client Unit Tests
 *
 * Tests the WebSocket client lifecycle, message parsing, reconnection,
 * and error handling.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocketClient } from '../client/ws-client';
import type { OrderNewMessage, OrderUpdateMessage, StateSyncMessage } from '../types';

/**
 * Mock WebSocket
 */
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  static lastInstance: MockWebSocket | null = null;

  url: string;
  readyState: number = 0;
  listeners: Map<string, Function[]> = new Map();

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    MockWebSocket.lastInstance = this;
  }

  addEventListener(event: string, handler: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  removeEventListener(event: string, handler: Function) {
    const handlers = this.listeners.get(event);
    if (handlers) {
      const idx = handlers.indexOf(handler);
      if (idx > -1) handlers.splice(idx, 1);
    }
  }

  send(data: string) {
    if (this.readyState !== 1) {
      throw new Error('WebSocket is not connected');
    }
  }

  close() {
    this.readyState = 3;
    this.emit('close', { code: 1000, reason: 'Normal closure' });
  }

  emit(event: string, detail: any) {
    const handlers = this.listeners.get(event) || [];
    handlers.forEach((handler) => {
      handler(detail);
    });
  }

  open() {
    this.readyState = 1;
    this.emit('open', {});
  }

  reset() {
    MockWebSocket.instances = [];
    MockWebSocket.lastInstance = null;
  }
}

// Replace global WebSocket
global.WebSocket = MockWebSocket as any;

describe('WebSocketClient', () => {
  let client: WebSocketClient;

  beforeEach(() => {
    MockWebSocket.instances = [];
    MockWebSocket.lastInstance = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (client) {
      client.disconnect();
    }
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe('Connection lifecycle', () => {
    it('should connect to WebSocket server', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:5001/ws',
      });

      client.connect();

      const ws = MockWebSocket.lastInstance;
      expect(ws).toBeDefined();
      expect(ws?.url).toBe('ws://localhost:5001/ws');
    });

    it('should emit "open" event on connection', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:5001/ws',
      });

      const openHandler = vi.fn();
      client.on('open', openHandler);

      client.connect();
      MockWebSocket.lastInstance?.open();

      expect(openHandler).toHaveBeenCalled();
    });

    it('should track connection state', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:5001/ws',
      });

      expect(client.isConnected()).toBe(false);
      expect(client.getConnectionState()).toBe('disconnected');

      client.connect();
      MockWebSocket.lastInstance?.open();

      expect(client.isConnected()).toBe(true);
      expect(client.getConnectionState()).toBe('connected');
    });

    it('should disconnect gracefully', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:5001/ws',
      });

      client.connect();
      MockWebSocket.lastInstance?.open();

      client.disconnect();

      expect(client.isConnected()).toBe(false);
    });

    it('should not reconnect after intentional close', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:5001/ws',
        maxReconnectAttempts: 3,
      });

      client.connect();
      const ws1 = MockWebSocket.lastInstance;
      ws1?.open();

      client.disconnect();
      MockWebSocket.instances = [];

      // Close and wait for reconnect timer
      vi.advanceTimersByTime(5000);

      // Should not have reconnected
      expect(MockWebSocket.instances.length).toBe(0);
    });
  });

  describe('Message handling', () => {
    it('should emit ORDER_NEW message', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:5001/ws',
      });

      const handler = vi.fn();
      client.on('ORDER_NEW', handler);

      client.connect();
      MockWebSocket.lastInstance?.open();

      const msg: OrderNewMessage = {
        type: 'ORDER_NEW',
        orderId: 'order-123',
        customerName: 'John',
        items: [{ itemId: 'item-1', name: 'Burger', quantity: 1 }],
        status: 'Received',
        createdAt: Date.now(),
        timestamp: Date.now(),
      };

      MockWebSocket.lastInstance?.emit('message', {
        data: JSON.stringify(msg),
      });

      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('should emit ORDER_UPDATE message', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:5001/ws',
      });

      const handler = vi.fn();
      client.on('ORDER_UPDATE', handler);

      client.connect();
      MockWebSocket.lastInstance?.open();

      const msg: OrderUpdateMessage = {
        type: 'ORDER_UPDATE',
        orderId: 'order-123',
        status: 'Preparing',
        timestamp: Date.now(),
      };

      MockWebSocket.lastInstance?.emit('message', {
        data: JSON.stringify(msg),
      });

      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('should emit STATE_SYNC message', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:5001/ws',
      });

      const handler = vi.fn();
      client.on('STATE_SYNC', handler);

      client.connect();
      MockWebSocket.lastInstance?.open();

      const msg: StateSyncMessage = {
        type: 'STATE_SYNC',
        orders: [
          {
            orderId: 'order-1',
            customerName: 'John',
            items: [],
            status: 'Received',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            timestamp: Date.now(),
          },
        ],
        timestamp: Date.now(),
      };

      MockWebSocket.lastInstance?.emit('message', {
        data: JSON.stringify(msg),
      });

      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('should handle malformed messages gracefully', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:5001/ws',
      });

      const errorHandler = vi.fn();
      client.on('error', errorHandler);

      client.connect();
      MockWebSocket.lastInstance?.open();

      MockWebSocket.lastInstance?.emit('message', {
        data: 'not json',
      });

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('Action sending', () => {
    it('should send action to server', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:5001/ws',
      });

      client.connect();
      MockWebSocket.lastInstance?.open();

      const sendSpy = vi.spyOn(MockWebSocket.lastInstance!, 'send');

      client.sendAction('order-123', 'ACCEPT');

      expect(sendSpy).toHaveBeenCalled();
      const [data] = sendSpy.mock.calls[0];
      const msg = JSON.parse(data as string);
      expect(msg.type).toBe('ACTION');
      expect(msg.orderId).toBe('order-123');
      expect(msg.action).toBe('ACCEPT');
    });

    it('should fail gracefully when not connected', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:5001/ws',
      });

      const errorHandler = vi.fn();
      client.on('ERROR', errorHandler);

      client.sendAction('order-123', 'ACCEPT');

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('Reconnection with exponential backoff', () => {
    it('should attempt reconnect with exponential backoff', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:5001/ws',
        initialReconnectDelay: 100,
        maxReconnectDelay: 3200,
        maxReconnectAttempts: 5,
      });

      client.connect();
      MockWebSocket.lastInstance?.open();

      // Close the connection
      MockWebSocket.lastInstance?.close();

      expect(MockWebSocket.instances.length).toBe(1);

      // After 100ms, should reconnect (attempt 1)
      vi.advanceTimersByTime(100);
      expect(MockWebSocket.instances.length).toBe(2);

      // Close again
      MockWebSocket.lastInstance?.close();

      // After 200ms, should reconnect again (attempt 2)
      vi.advanceTimersByTime(200);
      expect(MockWebSocket.instances.length).toBe(3);
    });

    it('should stop reconnecting after max attempts', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:5001/ws',
        initialReconnectDelay: 100,
        maxReconnectAttempts: 3,
      });

      client.connect();
      MockWebSocket.lastInstance?.open();

      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        MockWebSocket.lastInstance?.close();
        vi.advanceTimersByTime(1000);
      }

      const countBefore = MockWebSocket.instances.length;

      // Try to reconnect again
      vi.advanceTimersByTime(10000);

      // Should not have created a new connection
      expect(MockWebSocket.instances.length).toBe(countBefore);
    });
  });

  describe('Event subscription', () => {
    it('should support multiple listeners', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:5001/ws',
      });

      const handler1 = vi.fn();
      const handler2 = vi.fn();

      client.on('ORDER_NEW', handler1);
      client.on('ORDER_NEW', handler2);

      client.connect();
      MockWebSocket.lastInstance?.open();

      const msg = {
        type: 'ORDER_NEW',
        orderId: 'order-123',
        customerName: 'John',
        items: [],
        status: 'Received',
        createdAt: Date.now(),
        timestamp: Date.now(),
      };

      MockWebSocket.lastInstance?.emit('message', {
        data: JSON.stringify(msg),
      });

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should support unsubscribe', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:5001/ws',
      });

      const handler = vi.fn();
      const unsubscribe = client.on('ORDER_NEW', handler);

      client.connect();
      MockWebSocket.lastInstance?.open();

      unsubscribe();

      const msg = {
        type: 'ORDER_NEW',
        orderId: 'order-123',
        customerName: 'John',
        items: [],
        status: 'Received',
        createdAt: Date.now(),
        timestamp: Date.now(),
      };

      MockWebSocket.lastInstance?.emit('message', {
        data: JSON.stringify(msg),
      });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('Connection status change event', () => {
    it('should emit CONNECTION_STATUS_CHANGE on open', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:5001/ws',
      });

      const handler = vi.fn();
      client.on('CONNECTION_STATUS_CHANGE', handler);

      client.connect();
      MockWebSocket.lastInstance?.open();

      expect(handler).toHaveBeenCalledWith('connected');
    });

    it('should emit CONNECTION_STATUS_CHANGE on close', () => {
      client = new WebSocketClient({
        url: 'ws://localhost:5001/ws',
      });

      const handler = vi.fn();
      client.on('CONNECTION_STATUS_CHANGE', handler);

      client.connect();
      MockWebSocket.lastInstance?.open();

      vi.clearAllMocks();

      client.disconnect();

      expect(handler).toHaveBeenCalledWith('disconnected');
    });
  });
});
