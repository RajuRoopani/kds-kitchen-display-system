# Order Store — State Management

## Overview

The Order Store manages all order state for the Kitchen Display System using **Zustand**, a lightweight state management library.

## Design Decision: Why Zustand?

**Zustand vs Context vs Redux:**

| Feature | Zustand | Context | Redux |
|---------|---------|---------|-------|
| Bundle size | ~2KB | ~0KB (built-in) | ~40KB |
| Boilerplate | Minimal | Moderate | High |
| TypeScript | Excellent | Good | Good |
| Learning curve | Very low | Low | Steep |
| DevTools | Via middleware | Manual | Built-in |
| Subscriptions | Built-in | Via hooks | Built-in |

**Why Zustand for KDS:**

1. **Zero-dependency state management** — KDS already has React, no need for heavy libraries
2. **Automatic React integration** — Zustand hooks automatically trigger re-renders
3. **Subscriptions out of the box** — Can subscribe from non-React code (WebSocket handlers)
4. **Minimal re-renders** — Fine-grained selectors prevent unnecessary updates
5. **Simple testing** — `useOrderStore.getState()` for direct store access

## Architecture

```
┌─────────────────────────────────────┐
│     WebSocket Client (ws-client.ts) │
│  (connects to backend, emits events)│
└────────────────┬────────────────────┘
                 │
                 │ order updates
                 ↓
┌─────────────────────────────────────┐
│      Order Store (order-store.ts)   │
│   (Zustand state + normalized data) │
│                                     │
│  State:                             │
│  - orders: Map<orderId, Order>      │
│                                     │
│  Mutations:                         │
│  - upsertOrder()                    │
│  - removeOrder()                    │
│  - updateOrderStatus()              │
│  - replaceAllOrders() [STATE_SYNC]  │
│                                     │
│  Selectors (derived):               │
│  - getOrdersByStatus()              │
│  - getOrder()                       │
│  - getMetrics()                     │
└────────────────┬────────────────────┘
                 │
                 │ hooks
                 ↓
┌─────────────────────────────────────┐
│      React Components               │
│  (Kanban, OrderCard, Metrics, etc)  │
└─────────────────────────────────────┘
```

## Core State

```typescript
orders: Map<string, Order>
```

**Why a Map?**
- O(1) lookup by orderId (vs array O(n))
- Built-in uniqueness guarantee
- Efficient in-place updates
- Works well with Zustand's immutability model

## API Reference

### State

```typescript
const orders = useOrderStore(state => state.orders)
```

### Mutations

```typescript
// Add or update an order
upsertOrder(order: Order): void

// Remove an order
removeOrder(orderId: string): void

// Change order status
updateOrderStatus(orderId: string, newStatus: OrderStatus): void

// Replace all orders (used on STATE_SYNC from backend)
replaceAllOrders(orders: Order[]): void

// Set loading state for optimistic UI
setIsLoading(orderId: string, loading: boolean): void

// Auto-dismiss completed/cancelled orders
startDismissTimer(orderId: string, delayMs: number): void
cancelDismissTimer(orderId: string): void
cancelAllDismissTimers(): void
```

### Selectors (Derived State)

```typescript
// Get all orders for a status
getOrdersByStatus(status: OrderStatus): Order[]

// Get single order
getOrder(orderId: string): Order | undefined

// Get all orders
getAllOrders(): Order[]

// Get metrics
getMetrics(): {
  total: number
  byStatus: Record<OrderStatus, number>  // count per status
  avgWaitTime: number  // ms
}
```

## React Hooks

### Hook: useOrdersByStatus

```typescript
const orders = useOrdersByStatus('Received')
// Re-renders when Received orders change
```

### Hook: useOrder

```typescript
const order = useOrder('order-123')
// Re-renders when this order changes
```

### Hook: useAllOrders

```typescript
const allOrders = useAllOrders()
// Re-renders when any order changes
```

### Hook: useOrderMetrics

```typescript
const metrics = useOrderMetrics()
// { total: 42, byStatus: {...}, avgWaitTime: 15000 }
// Re-renders when metrics change
```

### Hook: useOrderCounts

```typescript
const counts = useOrderCounts()
// { Received: 5, Preparing: 3, Ready: 2, Completed: 0, Cancelled: 0 }
// Re-renders when counts change
```

## Integration with WebSocket Client

In your app initialization:

```typescript
import { WebSocketClient } from './client/ws-client'
import { useOrderStore } from './client/order-store'

const wsClient = new WebSocketClient({
  url: 'ws://localhost:5001/ws',
  verbose: true
})

// Connect WebSocket → Store
wsClient.on('ORDER_NEW', (msg) => {
  useOrderStore.getState().upsertOrder({
    orderId: msg.orderId,
    customerName: msg.customerName,
    items: msg.items,
    status: msg.status,
    createdAt: msg.createdAt,
    updatedAt: msg.timestamp
  })
})

wsClient.on('ORDER_UPDATE', (msg) => {
  useOrderStore.getState().updateOrderStatus(msg.orderId, msg.status)
})

wsClient.on('STATE_SYNC', (msg) => {
  const orders = msg.orders.map(o => ({
    ...o,
    updatedAt: o.timestamp
  }))
  useOrderStore.getState().replaceAllOrders(orders)
})

wsClient.connect()
```

## Optimistic Updates

For snappy UI, update the store immediately when user clicks an action, then revert on error:

```typescript
const orderId = 'order-123'
const store = useOrderStore.getState()

// Optimistic update
store.setIsLoading(orderId, true)

try {
  await wsClient.sendAction(orderId, 'ACCEPT')
  // Success — server will send ORDER_UPDATE
} catch (error) {
  // Revert
  store.setIsLoading(orderId, false)
  // Optionally revert to previous status
}
```

## Testing

Direct store access for tests:

```typescript
import { useOrderStore } from '../client/order-store'

test('upserts order', () => {
  const store = useOrderStore.getState()
  const order = { orderId: 'test-1', customerName: 'John', ... }
  
  store.upsertOrder(order)
  
  expect(store.getOrder('test-1')).toEqual(order)
})
```

## Performance

### Rendering

Zustand uses **selector-based subscriptions**. Components only re-render when their specific selector output changes.

```typescript
// Only re-renders when Received orders change, not all orders
const orders = useOrdersByStatus('Received')
```

vs

```typescript
// Re-renders when ANY order changes
const allOrders = useAllOrders()
```

### Memory

- Orders stored in a Map (memory-efficient)
- Timers cleaned up on unmount or STATE_SYNC
- No memory leaks from stale subscriptions

## Migration Path

If requirements change, Zustand can be swapped for Redux/MobX without changing component APIs much. The hooks remain the same.

---

## File Structure

```
src/
├── client/
│   ├── ws-client.ts       # WebSocket connection & message handling
│   ├── order-store.ts     # Zustand store + hooks
│   ├── action-dispatcher.ts # Action queue & confirmation
│   └── kanban-facade.ts   # High-level orchestration
├── store/
│   └── README.md          # This file
└── ...
```

## Troubleshooting

### "Order not updating in UI"

1. Check that you're using the correct hook, e.g., `useOrdersByStatus('Received')`
2. Verify the WebSocket client is connected and emitting events
3. Add `verbose: true` to WebSocketClient config and check console

### "Performance degradation with many orders"

Use fine-grained selectors instead of `useAllOrders()`:

```typescript
// ❌ Bad: re-renders on any change
const all = useAllOrders()

// ✅ Good: only re-renders when Received changes
const received = useOrdersByStatus('Received')
```

### "Memory leaks from timers"

Always call `cancelAllDismissTimers()` on unmount or STATE_SYNC. The store does this automatically in `replaceAllOrders()`.

---

## References

- [Zustand Documentation](https://github.com/pmndrs/zustand)
- [KDS Architecture](./ARCHITECTURE.md)
- [Type Definitions](../types.ts)
