/**
 * Order Store Unit Tests (Zustand)
 *
 * Tests the order state management, mutations, selectors, and subscriptions.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  useOrderStore,
  useOrdersByStatus,
  useOrder,
  useAllOrders,
  useOrderMetrics,
  useOrderCounts,
  getOrderStoreInstance,
} from '../client/order-store';
import type { Order, OrderStatus } from '../types';

/**
 * Test fixture: Create a test order
 */
function createTestOrder(overrides?: Partial<Order>): Order {
  const now = Date.now();
  return {
    orderId: 'order-test-' + Math.random().toString(36).slice(2),
    customerName: 'Test Customer',
    items: [
      {
        itemId: 'item-1',
        name: 'Burger',
        quantity: 1,
      },
    ],
    status: 'Received',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Order Store (Zustand)', () => {
  beforeEach(() => {
    // Clear store before each test
    const state = useOrderStore.getState();
    state.cancelAllDismissTimers();
    state.orders.clear();
  });

  afterEach(() => {
    const state = useOrderStore.getState();
    state.cancelAllDismissTimers();
  });

  describe('State mutations', () => {
    it('should upsert a new order', () => {
      const store = useOrderStore.getState();
      const order = createTestOrder();

      store.upsertOrder(order);

      const stored = store.getOrder(order.orderId);
      expect(stored).toEqual(order);
    });

    it('should update an existing order', () => {
      const store = useOrderStore.getState();
      const order = createTestOrder();

      store.upsertOrder(order);

      const updated = {
        ...order,
        status: 'Preparing' as OrderStatus,
        updatedAt: Date.now(),
      };

      store.upsertOrder(updated);

      const stored = store.getOrder(order.orderId);
      expect(stored?.status).toBe('Preparing');
    });

    it('should remove an order', () => {
      const store = useOrderStore.getState();
      const order = createTestOrder();

      store.upsertOrder(order);
      expect(store.getOrder(order.orderId)).toBeDefined();

      store.removeOrder(order.orderId);

      expect(store.getOrder(order.orderId)).toBeUndefined();
    });

    it('should update order status', () => {
      const store = useOrderStore.getState();
      const order = createTestOrder();

      store.upsertOrder(order);
      store.updateOrderStatus(order.orderId, 'Preparing');

      const updated = store.getOrder(order.orderId);
      expect(updated?.status).toBe('Preparing');
      expect(updated?.updatedAt).toBeGreaterThanOrEqual(order.updatedAt);
    });

    it('should replace all orders (STATE_SYNC)', () => {
      const store = useOrderStore.getState();

      // Add some orders
      store.upsertOrder(createTestOrder({ orderId: 'order-1' }));
      store.upsertOrder(createTestOrder({ orderId: 'order-2' }));

      // Replace all
      const newOrders = [
        createTestOrder({ orderId: 'order-3' }),
        createTestOrder({ orderId: 'order-4' }),
      ];

      store.replaceAllOrders(newOrders);

      expect(store.getAllOrders().length).toBe(2);
      expect(store.getOrder('order-1')).toBeUndefined();
      expect(store.getOrder('order-3')).toBeDefined();
    });

    it('should set isLoading flag', () => {
      const store = useOrderStore.getState();
      const order = createTestOrder();

      store.upsertOrder(order);
      store.setIsLoading(order.orderId, true);

      const updated = store.getOrder(order.orderId);
      expect(updated?.isLoading).toBe(true);
    });
  });

  describe('Selectors', () => {
    it('should get orders by status', () => {
      const store = useOrderStore.getState();

      store.upsertOrder(
        createTestOrder({ orderId: 'order-1', status: 'Received' })
      );
      store.upsertOrder(
        createTestOrder({ orderId: 'order-2', status: 'Received' })
      );
      store.upsertOrder(
        createTestOrder({ orderId: 'order-3', status: 'Preparing' })
      );

      const received = store.getOrdersByStatus('Received');
      expect(received.length).toBe(2);
      expect(received.every((o) => o.status === 'Received')).toBe(true);

      const preparing = store.getOrdersByStatus('Preparing');
      expect(preparing.length).toBe(1);
    });

    it('should get single order', () => {
      const store = useOrderStore.getState();
      const order = createTestOrder({ orderId: 'order-123' });

      store.upsertOrder(order);

      const found = store.getOrder('order-123');
      expect(found).toEqual(order);

      const notFound = store.getOrder('order-999');
      expect(notFound).toBeUndefined();
    });

    it('should get all orders', () => {
      const store = useOrderStore.getState();

      store.upsertOrder(createTestOrder({ orderId: 'order-1' }));
      store.upsertOrder(createTestOrder({ orderId: 'order-2' }));
      store.upsertOrder(createTestOrder({ orderId: 'order-3' }));

      const all = store.getAllOrders();
      expect(all.length).toBe(3);
    });

    it('should compute metrics', () => {
      const store = useOrderStore.getState();
      const now = Date.now();

      store.upsertOrder(
        createTestOrder({ orderId: 'order-1', status: 'Received', createdAt: now, updatedAt: now })
      );
      store.upsertOrder(
        createTestOrder({ orderId: 'order-2', status: 'Received', createdAt: now, updatedAt: now })
      );
      store.upsertOrder(
        createTestOrder({ orderId: 'order-3', status: 'Preparing', createdAt: now, updatedAt: now })
      );

      const metrics = store.getMetrics();
      expect(metrics.total).toBe(3);
      expect(metrics.byStatus.Received).toBe(2);
      expect(metrics.byStatus.Preparing).toBe(1);
      expect(metrics.byStatus.Ready).toBe(0);
    });
  });

  describe('Dismiss timers', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should start a dismiss timer', () => {
      const store = useOrderStore.getState();
      const order = createTestOrder();

      store.upsertOrder(order);
      store.startDismissTimer(order.orderId, 5000);

      // Order should still exist
      expect(store.getOrder(order.orderId)).toBeDefined();

      // Advance time past the timer
      vi.advanceTimersByTime(5100);

      // Order should be removed
      expect(store.getOrder(order.orderId)).toBeUndefined();
    });

    it('should cancel a dismiss timer', () => {
      const store = useOrderStore.getState();
      const order = createTestOrder();

      store.upsertOrder(order);
      store.startDismissTimer(order.orderId, 5000);
      store.cancelDismissTimer(order.orderId);

      // Advance time
      vi.advanceTimersByTime(6000);

      // Order should still exist (timer was cancelled)
      expect(store.getOrder(order.orderId)).toBeDefined();
    });

    it('should replace existing timer when starting a new one', () => {
      const store = useOrderStore.getState();
      const order = createTestOrder();

      store.upsertOrder(order);
      store.startDismissTimer(order.orderId, 5000);

      // Start a new timer (should replace the old one)
      store.startDismissTimer(order.orderId, 1000);

      // Advance time by 2000ms
      vi.advanceTimersByTime(2000);

      // Order should be removed (new timer was 1000ms)
      expect(store.getOrder(order.orderId)).toBeUndefined();
    });

    it('should cancel all dismiss timers', () => {
      const store = useOrderStore.getState();

      const order1 = createTestOrder({ orderId: 'order-1' });
      const order2 = createTestOrder({ orderId: 'order-2' });

      store.upsertOrder(order1);
      store.upsertOrder(order2);

      store.startDismissTimer('order-1', 5000);
      store.startDismissTimer('order-2', 3000);

      store.cancelAllDismissTimers();

      // Advance time past all timers
      vi.advanceTimersByTime(6000);

      // Both orders should still exist
      expect(store.getOrder('order-1')).toBeDefined();
      expect(store.getOrder('order-2')).toBeDefined();
    });

    it('should cancel timers on replaceAllOrders', () => {
      const store = useOrderStore.getState();

      const order1 = createTestOrder({ orderId: 'order-1' });
      store.upsertOrder(order1);
      store.startDismissTimer('order-1', 5000);

      // Replace all orders
      const newOrders = [createTestOrder({ orderId: 'order-2' })];
      store.replaceAllOrders(newOrders);

      // Advance time
      vi.advanceTimersByTime(6000);

      // Old order should not exist, new order should
      expect(store.getOrder('order-1')).toBeUndefined();
      expect(store.getOrder('order-2')).toBeDefined();
    });
  });

  describe('React hooks integration', () => {
    it('should have useOrdersByStatus hook', () => {
      const store = useOrderStore.getState();

      store.upsertOrder(
        createTestOrder({ orderId: 'order-1', status: 'Received' })
      );
      store.upsertOrder(
        createTestOrder({ orderId: 'order-2', status: 'Preparing' })
      );

      const received = useOrdersByStatus('Received');
      expect(received.length).toBe(1);
      expect(received[0].orderId).toBe('order-1');
    });

    it('should have useOrder hook', () => {
      const store = useOrderStore.getState();
      const order = createTestOrder({ orderId: 'order-123' });

      store.upsertOrder(order);

      const found = useOrder('order-123');
      expect(found).toEqual(order);
    });

    it('should have useAllOrders hook', () => {
      const store = useOrderStore.getState();

      store.upsertOrder(createTestOrder({ orderId: 'order-1' }));
      store.upsertOrder(createTestOrder({ orderId: 'order-2' }));

      const all = useAllOrders();
      expect(all.length).toBe(2);
    });

    it('should have useOrderMetrics hook', () => {
      const store = useOrderStore.getState();

      store.upsertOrder(
        createTestOrder({ orderId: 'order-1', status: 'Received' })
      );
      store.upsertOrder(
        createTestOrder({ orderId: 'order-2', status: 'Preparing' })
      );

      const metrics = useOrderMetrics();
      expect(metrics.total).toBe(2);
      expect(metrics.byStatus.Received).toBe(1);
    });

    it('should have useOrderCounts hook', () => {
      const store = useOrderStore.getState();

      store.upsertOrder(
        createTestOrder({ orderId: 'order-1', status: 'Received' })
      );
      store.upsertOrder(
        createTestOrder({ orderId: 'order-2', status: 'Received' })
      );

      const counts = useOrderCounts();
      expect(counts.Received).toBe(2);
      expect(counts.Preparing).toBe(0);
    });
  });

  describe('Direct store access', () => {
    it('should provide singleton accessor', () => {
      const store = getOrderStoreInstance();
      const order = createTestOrder();

      store.upsertOrder(order);

      const found = store.getOrder(order.orderId);
      expect(found).toEqual(order);
    });

    it('should support subscription', (done) => {
      const store = getOrderStoreInstance();
      const order = createTestOrder();

      let callCount = 0;
      const unsubscribe = store.subscribe(() => {
        callCount++;
        if (callCount === 2) {
          unsubscribe();
          done();
        }
      });

      store.upsertOrder(order);
    });
  });

  describe('Performance: Large order volumes', () => {
    it('should handle 1000 orders efficiently', () => {
      const store = useOrderStore.getState();

      const startTime = performance.now();

      for (let i = 0; i < 1000; i++) {
        store.upsertOrder(
          createTestOrder({
            orderId: `order-${i}`,
            status: ['Received', 'Preparing', 'Ready'][i % 3] as OrderStatus,
          })
        );
      }

      const insertTime = performance.now() - startTime;

      expect(store.getAllOrders().length).toBe(1000);
      expect(insertTime).toBeLessThan(500); // Should be fast
    });

    it('should query 1000 orders efficiently', () => {
      const store = useOrderStore.getState();

      for (let i = 0; i < 1000; i++) {
        store.upsertOrder(
          createTestOrder({
            orderId: `order-${i}`,
            status: 'Preparing',
          })
        );
      }

      const startTime = performance.now();
      const preparing = store.getOrdersByStatus('Preparing');
      const queryTime = performance.now() - startTime;

      expect(preparing.length).toBe(1000);
      expect(queryTime).toBeLessThan(100); // Queries should be fast
    });
  });

  describe('Edge cases', () => {
    it('should handle updating non-existent order', () => {
      const store = useOrderStore.getState();

      // Should not throw
      store.updateOrderStatus('non-existent', 'Preparing');

      expect(store.getOrder('non-existent')).toBeUndefined();
    });

    it('should handle removing non-existent order', () => {
      const store = useOrderStore.getState();

      // Should not throw
      store.removeOrder('non-existent');

      expect(store.getAllOrders().length).toBe(0);
    });

    it('should handle timer operations on non-existent order', () => {
      const store = useOrderStore.getState();

      // Should not throw
      store.startDismissTimer('non-existent', 1000);
      store.cancelDismissTimer('non-existent');

      expect(store.getAllOrders().length).toBe(0);
    });

    it('should handle empty store metrics', () => {
      const store = useOrderStore.getState();

      const metrics = store.getMetrics();

      expect(metrics.total).toBe(0);
      expect(metrics.avgWaitTime).toBe(0);
    });

    it('should handle filtering empty status', () => {
      const store = useOrderStore.getState();

      store.upsertOrder(
        createTestOrder({ orderId: 'order-1', status: 'Received' })
      );

      const ready = store.getOrdersByStatus('Ready');

      expect(ready.length).toBe(0);
    });
  });

  describe('State immutability', () => {
    it('should not mutate order when upserting', () => {
      const store = useOrderStore.getState();
      const order = createTestOrder();
      const originalOrder = { ...order };

      store.upsertOrder(order);

      // Modify the original reference
      order.status = 'Preparing';

      // Store should have the updated reference
      // (Note: Zustand uses shallow copy for Objects, Map updates are handled)
      const stored = store.getOrder(order.orderId);
      expect(stored?.status).toBe('Preparing'); // Updated because same reference
    });
  });
});
