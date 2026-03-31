/**
 * Order Store — Zustand State Management
 *
 * Manages the normalized order state for the KDS application.
 * - Stores orders by ID (O(1) lookups)
 * - Provides derived selectors grouped by status
 * - Manages auto-dismiss timers for Completed/Cancelled orders
 * - Supports React subscriptions for real-time updates
 *
 * Why Zustand?
 * - Lightweight, zero-dependency state management
 * - Simple API: create hooks directly, no providers needed
 * - Excellent TypeScript support
 * - Minimal boilerplate compared to Redux/Context
 * - Built-in subscription system for components
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Order, OrderStatus, IOrderStore } from '../types';

/**
 * Internal store state
 */
interface OrderStoreState {
  orders: Map<string, Order>;
}

/**
 * Internal store actions
 */
interface OrderStoreActions {
  upsertOrder(order: Order): void;
  removeOrder(orderId: string): void;
  updateOrderStatus(orderId: string, newStatus: OrderStatus): void;
  replaceAllOrders(orders: Order[]): void;
  setIsLoading(orderId: string, loading: boolean): void;
  getOrdersByStatus(status: OrderStatus): Order[];
  getOrder(orderId: string): Order | undefined;
  getAllOrders(): Order[];
  getMetrics(): {
    total: number;
    byStatus: Record<OrderStatus, number>;
    avgWaitTime: number;
  };
  startDismissTimer(orderId: string, delayMs: number): void;
  cancelDismissTimer(orderId: string): void;
  cancelAllDismissTimers(): void;
}

/**
 * Combined store type
 */
type OrderStore = OrderStoreState & OrderStoreActions;

/**
 * Create the Zustand store
 * Uses subscribeWithSelector middleware for fine-grained subscriptions
 */
const useOrderStore = create<OrderStore>()(
  subscribeWithSelector((set, get) => ({
    // State
    orders: new Map<string, Order>(),

    // Actions
    upsertOrder: (order: Order) => {
      set((state) => {
        const updated = new Map(state.orders);
        updated.set(order.orderId, order);
        return { orders: updated };
      });
    },

    removeOrder: (orderId: string) => {
      set((state) => {
        const updated = new Map(state.orders);
        updated.delete(orderId);
        return { orders: updated };
      });
    },

    updateOrderStatus: (orderId: string, newStatus: OrderStatus) => {
      set((state) => {
        const order = state.orders.get(orderId);
        if (!order) return {};

        const updated = new Map(state.orders);
        updated.set(orderId, {
          ...order,
          status: newStatus,
          updatedAt: Date.now(),
        });
        return { orders: updated };
      });
    },

    replaceAllOrders: (orders: Order[]) => {
      // Cancel all existing timers before replacing
      const state = get();
      state.cancelAllDismissTimers();

      set(() => {
        const newMap = new Map<string, Order>();
        orders.forEach((order) => {
          newMap.set(order.orderId, order);
        });
        return { orders: newMap };
      });
    },

    setIsLoading: (orderId: string, loading: boolean) => {
      set((state) => {
        const order = state.orders.get(orderId);
        if (!order) return {};

        const updated = new Map(state.orders);
        updated.set(orderId, {
          ...order,
          isLoading: loading,
        });
        return { orders: updated };
      });
    },

    getOrdersByStatus: (status: OrderStatus): Order[] => {
      const { orders } = get();
      const result: Order[] = [];
      orders.forEach((order) => {
        if (order.status === status) {
          result.push(order);
        }
      });
      return result;
    },

    getOrder: (orderId: string): Order | undefined => {
      return get().orders.get(orderId);
    },

    getAllOrders: (): Order[] => {
      return Array.from(get().orders.values());
    },

    getMetrics: () => {
      const { orders } = get();
      const byStatus: Record<OrderStatus, number> = {
        Received: 0,
        Preparing: 0,
        Ready: 0,
        Completed: 0,
        Cancelled: 0,
      };

      let totalWaitTime = 0;
      let orderCount = 0;

      orders.forEach((order) => {
        byStatus[order.status]++;
        const waitTime = order.updatedAt - order.createdAt;
        totalWaitTime += waitTime;
        orderCount++;
      });

      return {
        total: orders.size,
        byStatus,
        avgWaitTime: orderCount > 0 ? totalWaitTime / orderCount : 0,
      };
    },

    startDismissTimer: (orderId: string, delayMs: number) => {
      const timer = setTimeout(() => {
        get().removeOrder(orderId);
      }, delayMs);

      set((state) => {
        const order = state.orders.get(orderId);
        if (!order) return {};

        // Cancel existing timer if present
        if (order.dismissTimer) {
          clearTimeout(order.dismissTimer);
        }

        const updated = new Map(state.orders);
        updated.set(orderId, {
          ...order,
          dismissTimer: timer,
        });
        return { orders: updated };
      });
    },

    cancelDismissTimer: (orderId: string) => {
      set((state) => {
        const order = state.orders.get(orderId);
        if (!order) return {};

        if (order.dismissTimer) {
          clearTimeout(order.dismissTimer);
        }

        const updated = new Map(state.orders);
        updated.set(orderId, {
          ...order,
          dismissTimer: undefined,
        });
        return { orders: updated };
      });
    },

    cancelAllDismissTimers: () => {
      set((state) => {
        const updated = new Map(state.orders);
        updated.forEach((order) => {
          if (order.dismissTimer) {
            clearTimeout(order.dismissTimer);
          }
        });

        // Remove dismiss timers from all orders
        const cleaned = new Map<string, Order>();
        updated.forEach((order, key) => {
          cleaned.set(key, {
            ...order,
            dismissTimer: undefined,
          });
        });

        return { orders: cleaned };
      });
    },
  }))
);

/**
 * Export the hook for React components
 */
export { useOrderStore };

/**
 * Hook: Get all orders for a specific status
 * Re-renders when orders with this status change
 */
export const useOrdersByStatus = (status: OrderStatus): Order[] => {
  return useOrderStore((state) => state.getOrdersByStatus(status));
};

/**
 * Hook: Get a single order by ID
 * Re-renders when this order changes
 */
export const useOrder = (orderId: string): Order | undefined => {
  return useOrderStore((state) => state.getOrder(orderId));
};

/**
 * Hook: Get all orders
 * Re-renders when any order changes
 */
export const useAllOrders = (): Order[] => {
  return useOrderStore((state) => state.getAllOrders());
};

/**
 * Hook: Get order metrics
 * Re-renders when metrics change
 */
export const useOrderMetrics = () => {
  return useOrderStore((state) => state.getMetrics());
};

/**
 * Hook: Get order count by status
 * Re-renders when order statuses change
 */
export const useOrderCounts = (): Record<OrderStatus, number> => {
  const metrics = useOrderMetrics();
  return metrics.byStatus;
};

/**
 * Singleton accessor for testing and direct access
 * Components should prefer the hooks above
 */
export const getOrderStoreInstance = (): IOrderStore => {
  const state = useOrderStore.getState();
  return {
    // Expose state
    orders: state.orders,

    // Expose all methods
    upsertOrder: state.upsertOrder,
    removeOrder: state.removeOrder,
    updateOrderStatus: state.updateOrderStatus,
    replaceAllOrders: state.replaceAllOrders,
    setIsLoading: state.setIsLoading,
    getOrdersByStatus: state.getOrdersByStatus,
    getOrder: state.getOrder,
    getAllOrders: state.getAllOrders,
    getMetrics: state.getMetrics,
    startDismissTimer: state.startDismissTimer,
    cancelDismissTimer: state.cancelDismissTimer,
    cancelAllDismissTimers: state.cancelAllDismissTimers,

    // Subscription
    subscribe: (listener: (store: IOrderStore) => void) => {
      return useOrderStore.subscribe(
        () => {
          const updated = getOrderStoreInstance();
          listener(updated);
        },
        undefined,
        { fireImmediately: true }
      );
    },
  };
};
