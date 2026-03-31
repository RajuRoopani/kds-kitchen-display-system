/**
 * Kitchen Display System — Main App Component
 *
 * Orchestrates:
 * 1. WebSocket connection (senior_dev_1's ws-client)
 * 2. Order state management (senior_dev_1's order-store)
 * 3. Action dispatch (senior_dev_1's action-dispatcher)
 * 4. Kanban board layout with responsive design
 * 5. Detail modal for order actions
 *
 * Lifecycle:
 * - On mount: Initialize WebSocket, order store, and action dispatcher
 * - Subscribe to WebSocket events and update order store
 * - Handle reconnection and STATE_SYNC recovery
 * - Track connection status
 * - Render Kanban board + detail modal
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Kanban } from './components/Kanban';
import { OrderModal } from './components/OrderModal';
import { initializeOrderHooks } from './hooks/useOrder';
import { WebSocketClient } from './client/ws-client';
import { OrderStore } from './client/order-store';
import { ActionDispatcher } from './client/action-dispatcher';
import { useOrder } from './hooks/useOrder';
import type {
  IncomingMessage,
  Order,
  OrderData,
  IOrderStore,
  IActionDispatcher,
  IWebSocketClient,
} from './types';

/**
 * App Component: Main orchestrator for KDS
 */
const App: React.FC = () => {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [appReady, setAppReady] = useState<boolean>(false);
  const [wsClient, setWsClient] = useState<IWebSocketClient | null>(null);
  const [orderStore, setOrderStore] = useState<IOrderStore | null>(null);
  const [actionDispatcher, setActionDispatcher] =
    useState<IActionDispatcher | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const selectedOrder = useOrder(selectedOrderId || '');

  /**
   * Initialize app on mount
   * Sets up WebSocket, order store, and action dispatcher
   */
  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('App: Initializing KDS...');

        // Create instances
        const ws = new WebSocketClient(
          process.env.REACT_APP_WS_URL || 'wss://localhost:5000/orders'
        );
        const store = new OrderStore();
        const dispatcher = new ActionDispatcher(ws, store);

        // Set state
        setWsClient(ws);
        setOrderStore(store);
        setActionDispatcher(dispatcher);

        // Initialize hooks for React components
        initializeOrderHooks(store, dispatcher);

        // Subscribe to WebSocket events
        ws.onConnected(() => {
          console.log('App: WebSocket connected');
          setIsConnected(true);
        });

        ws.onDisconnected(() => {
          console.log('App: WebSocket disconnected');
          setIsConnected(false);
        });

        ws.onMessage((msg) => handleWebSocketMessage(msg, store));

        ws.onError((error) => {
          console.error('App: WebSocket error:', error);
        });

        // Connect to WebSocket
        await ws.connect();

        setAppReady(true);
        console.log('App: KDS initialized successfully');
      } catch (error) {
        console.error('App: Failed to initialize', error);
        // Still render app, but will show offline state
        setAppReady(true);
      }
    };

    initializeApp();

    // Cleanup on unmount
    return () => {
      wsClient?.disconnect();
    };
  }, []);

  /**
   * Handle incoming WebSocket messages
   * Routes different message types to appropriate store methods
   */
  const handleWebSocketMessage = useCallback(
    (msg: IncomingMessage, store: IOrderStore): void => {
      switch (msg.type) {
        case 'ORDER_NEW':
          // New order arrived
          const newOrder: Order = {
            orderId: msg.orderId,
            customerName: msg.customerName,
            items: msg.items,
            status: msg.status,
            createdAt: msg.createdAt,
            updatedAt: msg.timestamp,
          };
          store.upsertOrder(newOrder);
          console.log('[ORDER_NEW]', msg.orderId, msg.customerName);
          break;

        case 'ORDER_UPDATE':
          // Order status changed
          const existingOrder = store.getOrder(msg.orderId);
          if (existingOrder) {
            const wasTerminal =
              existingOrder.status === 'Completed' ||
              existingOrder.status === 'Cancelled';
            const isNowTerminal =
              msg.status === 'Completed' || msg.status === 'Cancelled';

            store.updateOrderStatus(msg.orderId, msg.status);

            // Start dismiss timer if order just became terminal
            if (isNowTerminal && !wasTerminal) {
              const delayMs =
                msg.status === 'Completed' ? 5000 : 10000;
              store.startDismissTimer(msg.orderId, delayMs);
            }

            console.log(
              '[ORDER_UPDATE]',
              msg.orderId,
              existingOrder.status,
              '→',
              msg.status
            );
          }
          break;

        case 'STATE_SYNC':
          // Full state sync after reconnection
          store.cancelAllDismissTimers();

          // Convert OrderData to Order format
          const orders: Order[] = msg.orders.map((od: OrderData) => ({
            orderId: od.orderId,
            customerName: od.customerName,
            items: od.items,
            status: od.status,
            createdAt: od.createdAt,
            updatedAt: od.updatedAt,
          }));

          store.replaceAllOrders(orders);

          // Restart timers for terminal orders
          for (const order of orders) {
            if (order.status === 'Completed') {
              store.startDismissTimer(order.orderId, 5000);
            } else if (order.status === 'Cancelled') {
              store.startDismissTimer(order.orderId, 10000);
            }
          }

          console.log('[STATE_SYNC]', orders.length, 'orders');
          break;

        case 'CONFIRMATION':
          // Confirmation of action from backend
          console.log(
            '[CONFIRMATION]',
            msg.orderId,
            msg.action,
            msg.success ? '✓' : '✗'
          );
          break;

        case 'ERROR':
          // Error from backend
          console.error('[ERROR]', msg.code, msg.reason);
          break;

        default:
          console.warn('[UNKNOWN_MESSAGE]', msg);
      }
    },
    []
  );

  /**
   * Handle order card click: open detail modal
   */
  const handleOrderClick = useCallback((orderId: string) => {
    setSelectedOrderId(orderId);
  }, []);

  /**
   * Handle modal close
   */
  const handleModalClose = useCallback(() => {
    setSelectedOrderId(null);
  }, []);

  /**
   * Render loading state or main app
   */
  if (!appReady) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          backgroundColor: '#f9f9f9',
          fontSize: '14px',
          color: '#999',
        }}
      >
        <div>Initializing Kitchen Display System...</div>
      </div>
    );
  }

  return (
    <div id="kds-dashboard">
      {/* Main Kanban Board */}
      <Kanban
        isConnected={isConnected}
        onOrderClick={handleOrderClick}
      />

      {/* Detail Modal for Order Actions */}
      <OrderModal
        order={selectedOrder || null}
        isOpen={selectedOrderId !== null}
        onClose={handleModalClose}
      />
    </div>
  );
};

export default App;
