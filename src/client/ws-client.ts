/**
 * WebSocket Client for KDS Order Updates
 *
 * Manages real-time connection to the mock backend WebSocket server.
 * Handles:
 * - Connection lifecycle (open, close, error, reconnect)
 * - Message parsing and event dispatch
 * - Exponential backoff reconnection (max 5 attempts)
 * - Error handling and logging
 *
 * All message types are defined in /workspace/kds_app/src/types.ts
 */

import type {
  Order,
  OrderStatus,
  OrderUpdateMessage,
  OrderNewMessage,
  StateSyncMessage,
  ConfirmationMessage,
  ErrorMessage,
} from '../types';

/**
 * Event types emitted by the WebSocket client
 */
export type WSEventType =
  | 'open'
  | 'close'
  | 'error'
  | 'ORDER_NEW'
  | 'ORDER_UPDATE'
  | 'STATE_SYNC'
  | 'CONFIRMATION'
  | 'ERROR'
  | 'CONNECTION_STATUS_CHANGE';

/**
 * Event listener callback signature
 */
type EventListener<T = any> = (payload: T) => void;

/**
 * Configuration for WebSocket client
 */
export interface WebSocketClientConfig {
  url: string;
  maxReconnectAttempts?: number;
  initialReconnectDelay?: number;
  maxReconnectDelay?: number;
  verbose?: boolean;
}

/**
 * WebSocket Client
 * Singleton pattern — create once, reuse
 */
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private url: string;
  private maxReconnectAttempts: number;
  private initialReconnectDelay: number;
  private maxReconnectDelay: number;
  private verbose: boolean;

  // Reconnection state
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isIntentionallyClosed: boolean = false;

  // Event listeners
  private listeners: Map<WSEventType, Set<EventListener>> = new Map();

  // Connection state
  private connectionState: 'disconnected' | 'connecting' | 'connected' = 'disconnected';

  constructor(config: WebSocketClientConfig) {
    this.url = config.url;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 5;
    this.initialReconnectDelay = config.initialReconnectDelay ?? 1000;
    this.maxReconnectDelay = config.maxReconnectDelay ?? 30000;
    this.verbose = config.verbose ?? false;
  }

  /**
   * Connect to the WebSocket server
   */
  public connect(): void {
    if (this.connectionState === 'connecting' || this.connectionState === 'connected') {
      this.log('Already connecting or connected, skipping...');
      return;
    }

    this.isIntentionallyClosed = false;
    this.connectionState = 'connecting';
    this.emit('CONNECTION_STATUS_CHANGE', 'connecting');

    try {
      this.log(`Connecting to ${this.url}`);
      this.ws = new WebSocket(this.url);

      this.ws.addEventListener('open', () => this.handleOpen());
      this.ws.addEventListener('message', (event) => this.handleMessage(event));
      this.ws.addEventListener('error', (event) => this.handleError(event));
      this.ws.addEventListener('close', (event) => this.handleClose(event));
    } catch (error) {
      this.log('Failed to create WebSocket:', error);
      this.handleError(error);
    }
  }

  /**
   * Gracefully disconnect
   */
  public disconnect(): void {
    this.isIntentionallyClosed = true;
    this.reconnectAttempts = 0;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        this.log('Error closing WebSocket:', error);
      }
      this.ws = null;
    }

    this.connectionState = 'disconnected';
    this.emit('CONNECTION_STATUS_CHANGE', 'disconnected');
  }

  /**
   * Send an action to the server
   * Actions: ACCEPT, READY, COMPLETE, CANCEL
   */
  public sendAction(
    orderId: string,
    action: 'ACCEPT' | 'READY' | 'COMPLETE' | 'CANCEL'
  ): void {
    if (this.connectionState !== 'connected' || !this.ws) {
      const error = `Cannot send action: WebSocket is not connected (state: ${this.connectionState})`;
      this.log(error);
      this.emit('ACTION_ERROR', {
        orderId,
        action,
        error,
        timestamp: Date.now(),
      });
      return;
    }

    const message = {
      type: 'ACTION',
      orderId,
      action,
      timestamp: Date.now(),
    };

    try {
      this.log(`Sending action: ${JSON.stringify(message)}`);
      this.ws.send(JSON.stringify(message));
    } catch (error) {
      this.log('Failed to send action:', error);
      this.emit('ERROR', {
        type: 'ERROR' as const,
        code: 'INTERNAL_ERROR',
        reason: String(error),
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Check if WebSocket is connected
   */
  public isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  /**
   * Get current connection state
   */
  public getConnectionState(): 'disconnected' | 'connecting' | 'connected' {
    return this.connectionState;
  }

  /**
   * Subscribe to an event
   */
  public on<T = any>(eventType: WSEventType, listener: EventListener<T>): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    const listeners = this.listeners.get(eventType)!;
    listeners.add(listener as EventListener);

    // Return unsubscribe function
    return () => {
      listeners.delete(listener as EventListener);
    };
  }

  /**
   * Unsubscribe from an event
   */
  public off(eventType: WSEventType, listener: EventListener): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * Private: Handle WebSocket open
   */
  private handleOpen(): void {
    this.log('WebSocket connected');
    this.connectionState = 'connected';
    this.reconnectAttempts = 0;
    this.emit('open', undefined);
    this.emit('CONNECTION_STATUS_CHANGE', 'connected');
  }

  /**
   * Private: Handle incoming messages
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      this.log(`Received message: ${data.type}`, data);

      // Dispatch by message type
      switch (data.type) {
        case 'ORDER_NEW':
          this.emit('ORDER_NEW', data as OrderNewMessage);
          break;
        case 'ORDER_UPDATE':
          this.emit('ORDER_UPDATE', data as OrderUpdateMessage);
          break;
        case 'STATE_SYNC':
          this.emit('STATE_SYNC', data as StateSyncMessage);
          break;
        case 'CONFIRMATION':
          this.emit('CONFIRMATION', data as ConfirmationMessage);
          break;
        case 'ERROR':
          this.emit('ERROR', data as ErrorMessage);
          break;
        default:
          this.log(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      this.log('Failed to parse message:', event.data, error);
      this.emit('error', error);
    }
  }

  /**
   * Private: Handle WebSocket error
   */
  private handleError(error: Event | Error | unknown): void {
    this.log('WebSocket error:', error);
    this.emit('error', error);
  }

  /**
   * Private: Handle WebSocket close
   */
  private handleClose(event: CloseEvent): void {
    this.log(`WebSocket closed: code=${event.code}, reason=${event.reason}`);
    this.connectionState = 'disconnected';
    this.emit('close', { code: event.code, reason: event.reason });
    this.emit('CONNECTION_STATUS_CHANGE', 'disconnected');

    // Attempt reconnect if not intentionally closed
    if (!this.isIntentionallyClosed) {
      this.attemptReconnect();
    }
  }

  /**
   * Private: Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.log(`Max reconnect attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      return;
    }

    this.reconnectAttempts++;

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s (max 30s)
    const delay = Math.min(
      this.initialReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelay
    );

    this.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /**
   * Private: Emit an event to all listeners
   */
  private emit<T = any>(eventType: WSEventType, payload: T): void {
    const listeners = this.listeners.get(eventType);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(payload);
        } catch (error) {
          this.log(`Error in listener for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Private: Log a message (if verbose)
   */
  private log(...args: any[]): void {
    if (this.verbose) {
      console.log('[WebSocketClient]', ...args);
    }
  }
}
