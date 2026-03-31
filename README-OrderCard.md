# OrderCard Component

## Overview

The `OrderCard` component displays a single order in the Kitchen Display System (KDS) kanban dashboard. Each card shows essential order information and provides visual feedback for order status.

## Props

```typescript
interface OrderCardProps {
  order: Order;           // The order to display
  onOpen?: () => void;    // Callback when card is clicked (opens detail modal)
}
```

### Order Interface

See `src/types.ts` for the complete `Order` type definition. Key properties:

- `orderId: string` — Unique order identifier
- `customerName: string` — Name of the customer who placed the order
- `items: OrderItem[]` — Array of items in the order
- `status: OrderStatus` — Current order status (Received, Preparing, Ready, Completed, Cancelled)
- `createdAt: number` — Unix timestamp when order was created (in milliseconds)
- `isLoading?: boolean` — True while action is in progress; shows spinner overlay

## Component Behavior

### Rendering

The card displays in the following layout:

```
┌─────────────────────────────────────┐
│ #12847 (Order ID, 16px bold)        │
│                                     │
│ John Smith (Customer, 14px)         │
│ Burger, Fries, Coke (Items, 13px)   │
│                                     │
│ Placed 5m 30s ago (Elapsed, 11px)   │
└─────────────────────────────────────┘
```

The card has a **left accent border (4px)** that changes color based on the order status:

- **Received** → Blue (#2196f3)
- **Preparing** → Amber (#ff9800)
- **Ready** → Green (#4caf50)
- **Completed** → Gray (#9e9e9e)
- **Cancelled** → Red (#f44336)

### Styling

**Desktop (≥768px):**
- Padding: 16px
- Border radius: 8px
- Min height: 140px
- Hover effect: elevated shadow, background #fafafa

**Mobile (<768px):**
- Padding: 12px (reduced)
- Border radius: 6px (reduced)
- Min height: auto (flexible)
- Layout optimized for smaller screens

### Interaction

1. **Click**: Triggers the `onOpen` callback, opening the detail modal
2. **Keyboard**: Can be activated with Enter or Space keys (accessible)
3. **Loading**: Shows spinner overlay when `isLoading = true`, blocks interaction
4. **Hover**: Subtle shadow elevation and background color change

## Integration

### With CardContainer

`CardContainer` maps orders to `OrderCard` components:

```typescript
<CardContainer 
  orders={ordersByStatus[status]} 
  status={status}
  onOrderClick={handleOrderClick} 
/>
```

The container passes each order to `OrderCard` and converts `orderId` to `onOpen` callback.

### With Order Store

`OrderCard` receives order data from the order store via `useOrdersByStatus()` hook:

```typescript
const orders = useOrdersByStatus('Received');
// Each order is passed to OrderCard
```

### With Order State

- `order.isLoading` is set to `true` while awaiting CONFIRMATION from backend
- `order.status` determines accent border color
- `order.items` shows the full items list with quantities

## CSS Styling

### Style Classes

All styles are in `src/components/OrderCard.module.css` using CSS modules (scoped).

| Class | Purpose |
|-------|---------|
| `.card` | Main card container with status accent |
| `.cardId` | Order ID display (16px bold) |
| `.customerName` | Customer name display (14px) |
| `.items` | Items list display (13px) |
| `.footer` | Footer container with elapsed time |
| `.elapsedTime` | Elapsed time text (11px) |
| `.loadingOverlay` | Semi-transparent overlay during loading |
| `.loadingSpinner` / `.spinner` | Animated spinner icon (CSS keyframes) |

### CSS Variables

The card uses CSS custom properties for dynamic status colors:

```css
--status-accent-color: /* Set by data-status attribute */
```

## Accessibility

- **Role**: `button` (semantic HTML)
- **Keyboard**: Tab-focusable (tabindex="0"), activatable with Enter/Space
- **ARIA**: `aria-label` includes order ID and customer name
- **Focus**: 2px blue outline on focus (WCAG AA compliant)
- **Color contrast**: All text meets 4.5:1 ratio

## Testing

### Test Coverage

Unit tests are in `src/__tests__/OrderCard.test.ts`:

- ✅ Rendering: order ID, customer name, items, elapsed time
- ✅ Interactions: click, keyboard activation (Enter/Space)
- ✅ Loading state: spinner overlay and disabled interaction
- ✅ Time formatting: seconds, minutes, hours
- ✅ Item formatting: quantities and commas

Integration tests are in `src/__tests__/OrderCard.integration.test.ts`:

- ✅ Multiple orders rendering with different statuses
- ✅ Order click handling and callback
- ✅ Large list performance (100+ orders)
- ✅ Status-specific rendering
- ✅ Data attribute consistency

### Running Tests

```bash
npm test -- src/__tests__/OrderCard.test.ts -v
npm test -- src/__tests__/OrderCard.integration.test.ts -v
```

Coverage target: 80%+

## Design Reference

For complete design specifications, see:

- `docs/DESIGN.md` — UX design with wireframes and component specs
- `docs/ARCHITECTURE.md` — System architecture and data flow
- `src/types.ts` — TypeScript type definitions for Order and related types

## Example Usage

```typescript
import { OrderCard } from './components/OrderCard';
import type { Order } from './types';

const order: Order = {
  orderId: '12847',
  customerName: 'John Smith',
  items: [
    { itemId: '1', name: 'Burger', quantity: 1 },
    { itemId: '2', name: 'Fries', quantity: 2 },
  ],
  status: 'Received',
  createdAt: Date.now() - 5 * 60 * 1000, // 5 minutes ago
  updatedAt: Date.now(),
};

function handleOrderClick() {
  console.log('Opening detail modal...');
}

export function MyComponent() {
  return (
    <OrderCard 
      order={order}
      onOpen={handleOrderClick}
    />
  );
}
```

## Component Implementation Notes

- **No external dependencies** for styling (pure CSS modules)
- **No animation libraries** (CSS keyframes for spinner)
- **Fully typed** with TypeScript (zero `any` types)
- **Responsive** with mobile-first approach
- **Accessible** following WCAG 2.1 AA standards

## Performance Considerations

- Uses React.FC with memoization opportunities via CardContainer
- Minimal re-renders: only when order prop changes
- Lightweight: ~120 lines of code including comments
- CSS optimized: single border-left property for accent (vs. multiple properties)

## Responsive Breakpoint

- Desktop: ≥768px — Full layout with 16px padding
- Mobile: <768px — Compact layout with 12px padding and optimized grid

## Future Enhancements

- [ ] Drag-and-drop reordering support
- [ ] Swipe gestures for mobile actions
- [ ] Custom animation on status change
- [ ] Sound/visual notification for new orders
- [ ] Estimated prep time display
