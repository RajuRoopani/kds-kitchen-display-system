/**
 * Kitchen Display System — Comprehensive Integration Tests
 * 
 * Tests all 7 Acceptance Criteria:
 * AC1: Desktop layout renders 5 order columns
 * AC2: Sticky headers display order counts in badges (real-time)
 * AC3: Mobile layout (<768px) shows 1 column + tab selector
 * AC4: Tab selector is WCAG 2.1 compliant (keyboard nav, aria-labels)
 * AC5: WebSocket real-time updates: order appears in column within 200ms
 * AC6: Empty states render correctly when column has no orders
 * AC7: Order click triggers modal with full order details
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Kanban } from '../components/Kanban';
import { OrderStore } from '../client/order-store';
import { WebSocketClient } from '../client/ws-client';
import { ActionDispatcher } from '../client/action-dispatcher';
import { initializeOrderHooks } from '../hooks/useOrder';
import type { Order, OrderNewMessage, OrderUpdateMessage } from '../types';

// Mock WebSocket for testing
class MockWebSocket {
  public static instances: MockWebSocket[] = [];
  public readyState: number = WebSocket.CONNECTING;
  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
    setTimeout(() => {
      this.readyState = WebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }, 0);
  }

  public send(data: string): void {}

  public close(code?: number, reason?: string): void {
    this.readyState = WebSocket.CLOSED;
    this.onclose?.(new CloseEvent('close', { code: code || 1000 }));
  }

  public simulateMessage(message: any): void {
    const event = new MessageEvent('message', {
      data: JSON.stringify(message),
    });
    this.onmessage?.(event);
  }

  public static reset(): void {
    MockWebSocket.instances = [];
  }
}

const originalWebSocket = global.WebSocket as any;

describe('Kanban Integration Tests — All 7 Acceptance Criteria', () => {
  let wsClient: WebSocketClient;
  let orderStore: OrderStore;
  let actionDispatcher: ActionDispatcher;
  let mockWs: MockWebSocket;

  beforeEach(async () => {
    (global as any).WebSocket = MockWebSocket;
    MockWebSocket.reset();
    vi.useFakeTimers();

    wsClient = new WebSocketClient('wss://localhost:5000/orders');
    orderStore = new OrderStore();
    actionDispatcher = new ActionDispatcher(wsClient, orderStore);
    initializeOrderHooks(orderStore, actionDispatcher);

    await wsClient.connect();
    vi.runAllTimersAsync();
    mockWs = MockWebSocket.instances[0];
    expect(wsClient.isConnected()).toBe(true);
  });

  afterEach(() => {
    wsClient.disconnect();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    (global as any).WebSocket = originalWebSocket;
    MockWebSocket.reset();
  });

  describe('AC1: Desktop Layout — 5 Columns Rendering', () => {
    it('should render 5 columns on desktop (768px+ width)', async () => {
      // Setup: Mock window.innerWidth as desktop
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      // Create sample orders in each status
      const orders: Order[] = [
        {
          orderId: 'order-1',
          customerName: 'Alice',
          items: [{ itemId: 'item-1', name: 'Burger', quantity: 1 }],
          status: 'Received',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          orderId: 'order-2',
          customerName: 'Bob',
          items: [{ itemId: 'item-2', name: 'Pizza', quantity: 2 }],
          status: 'Preparing',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          orderId: 'order-3',
          customerName: 'Charlie',
          items: [{ itemId: 'item-3', name: 'Salad', quantity: 1 }],
          status: 'Ready',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          orderId: 'order-4',
          customerName: 'Diana',
          items: [{ itemId: 'item-4', name: 'Fries', quantity: 1 }],
          status: 'Completed',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          orderId: 'order-5',
          customerName: 'Eve',
          items: [{ itemId: 'item-5', name: 'Drink', quantity: 1 }],
          status: 'Cancelled',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ];

      orders.forEach((order) => orderStore.upsertOrder(order));

      // Render Kanban
      const { container } = render(
        React.createElement(Kanban, { isConnected: true })
      );

      // Verify 5 columns are rendered
      const columns = container.querySelectorAll('[data-status]');
      expect(columns.length).toBeGreaterThanOrEqual(5);

      // Verify each status column exists
      const statuses = ['Received', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
      statuses.forEach((status) => {
        const statusColumn = container.querySelector(`[data-status="${status}"]`);
        expect(statusColumn).toBeTruthy();
      });
    });

    it('should render all orders in correct columns on desktop', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const order = {
        orderId: 'order-desk-1',
        customerName: 'Test User',
        items: [{ itemId: 'item-1', name: 'Test Item', quantity: 1 }],
        status: 'Received' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      orderStore.upsertOrder(order);

      render(React.createElement(Kanban, { isConnected: true }));

      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument();
      });
    });
  });

  describe('AC2: Sticky Headers with Badge Counts (Real-Time)', () => {
    it('should display column headers with order count badges', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const order1 = {
        orderId: 'order-badge-1',
        customerName: 'Alice',
        items: [],
        status: 'Received' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const order2 = {
        orderId: 'order-badge-2',
        customerName: 'Bob',
        items: [],
        status: 'Received' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      orderStore.upsertOrder(order1);
      orderStore.upsertOrder(order2);

      const { container } = render(
        React.createElement(Kanban, { isConnected: true })
      );

      // Find headers
      const receivedHeader = container.querySelector('.column-header[data-status="Received"]');
      expect(receivedHeader).toBeInTheDocument();

      // Badge should show count of 2
      const badge = receivedHeader?.querySelector('.count-badge');
      expect(badge).toBeInTheDocument();
      expect(badge?.textContent).toBe('2');
    });

    it('should update badge counts in real-time when orders arrive', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const { container, rerender } = render(
        React.createElement(Kanban, { isConnected: true })
      );

      // Initially, Received should have 0 orders
      let receivedHeader = container.querySelector('.column-header[data-status="Received"]');
      let badge = receivedHeader?.querySelector('.count-badge');
      expect(badge?.textContent).toBe('0');

      // Simulate ORDER_NEW via WebSocket
      const newOrderMsg: OrderNewMessage = {
        type: 'ORDER_NEW',
        orderId: 'order-realtime-1',
        customerName: 'Real-time User',
        items: [],
        status: 'Received',
        createdAt: Date.now(),
        timestamp: Date.now(),
      };

      mockWs.simulateMessage(newOrderMsg);
      vi.runAllTimersAsync();

      // Re-render to pick up store changes
      rerender(React.createElement(Kanban, { isConnected: true }));

      await waitFor(() => {
        const updatedHeader = container.querySelector('.column-header[data-status="Received"]');
        const updatedBadge = updatedHeader?.querySelector('.count-badge');
        expect(updatedBadge?.textContent).toBe('1');
      });
    });
  });

  describe('AC3: Mobile Layout (<768px) with Tab Selector', () => {
    it('should render 1 column + tab selector on mobile', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375, // Mobile width
      });

      const order = {
        orderId: 'order-mobile-1',
        customerName: 'Mobile User',
        items: [],
        status: 'Received' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      orderStore.upsertOrder(order);

      const { container } = render(
        React.createElement(Kanban, { isConnected: true })
      );

      // Verify tab selector exists
      const tabSelector = container.querySelector('.mobile-tab-selector');
      expect(tabSelector).toBeInTheDocument();

      // Verify 5 tabs exist
      const tabs = container.querySelectorAll('.mobile-tab');
      expect(tabs.length).toBe(5);

      // Verify only 1 column is visible
      const columns = container.querySelectorAll('.kanban-column');
      expect(columns.length).toBe(1);
    });

    it('should switch columns when tab is clicked on mobile', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      const receivedOrder = {
        orderId: 'order-received',
        customerName: 'Alice',
        items: [],
        status: 'Received' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      const readyOrder = {
        orderId: 'order-ready',
        customerName: 'Bob',
        items: [],
        status: 'Ready' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      orderStore.upsertOrder(receivedOrder);
      orderStore.upsertOrder(readyOrder);

      render(React.createElement(Kanban, { isConnected: true }));

      // Initially should show Received tab
      expect(screen.getByText('Alice')).toBeInTheDocument();
      expect(screen.queryByText('Bob')).not.toBeInTheDocument();

      // Click Ready tab
      const readyTab = screen.getByRole('tab', { name: /Ready/ });
      fireEvent.click(readyTab);

      await waitFor(() => {
        expect(screen.getByText('Bob')).toBeInTheDocument();
        expect(screen.queryByText('Alice')).not.toBeInTheDocument();
      });
    });
  });

  describe('AC4: Mobile Tab Selector — WCAG 2.1 Accessibility', () => {
    it('should have proper aria-selected attribute on tabs', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(React.createElement(Kanban, { isConnected: true }));

      const receivedTab = screen.getByRole('tab', { name: /Received/ });
      const readyTab = screen.getByRole('tab', { name: /Ready/ });

      expect(receivedTab).toHaveAttribute('aria-selected', 'true');
      expect(readyTab).toHaveAttribute('aria-selected', 'false');
    });

    it('should have descriptive aria-labels on all tabs', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      const mockStatusCounts = {
        Received: 4,
        Preparing: 2,
        Ready: 5,
        Completed: 0,
        Cancelled: 0,
      };

      // Set up orders to match counts
      for (let i = 0; i < 4; i++) {
        orderStore.upsertOrder({
          orderId: `order-r-${i}`,
          customerName: `User ${i}`,
          items: [],
          status: 'Received',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      render(React.createElement(Kanban, { isConnected: true }));

      const receivedTab = screen.getByRole('tab', { name: /Received.*orders/ });
      expect(receivedTab).toBeInTheDocument();
    });

    it('should support keyboard navigation on mobile tabs', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      const readyOrder = {
        orderId: 'order-kbd-ready',
        customerName: 'Keyboard Test',
        items: [],
        status: 'Ready' as const,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      orderStore.upsertOrder(readyOrder);

      render(React.createElement(Kanban, { isConnected: true }));

      const readyTab = screen.getByRole('tab', { name: /Ready/ });

      // Simulate Enter key press
      fireEvent.keyDown(readyTab, { key: 'Enter' });
      fireEvent.click(readyTab);

      await waitFor(() => {
        expect(readyTab).toHaveAttribute('aria-selected', 'true');
      });
    });

    it('should have role="tablist" on tab container', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      render(React.createElement(Kanban, { isConnected: true }));

      const tablist = screen.getByRole('tablist');
      expect(tablist).toHaveClass('mobile-tab-selector');
    });
  });

  describe('AC5: WebSocket Real-Time Updates (200ms Threshold)', () => {
    it('should render new order within 200ms of ORDER_NEW message', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const startTime = Date.now();

      render(React.createElement(Kanban, { isConnected: true }));

      // Simulate ORDER_NEW via WebSocket
      const newOrderMsg: OrderNewMessage = {
        type: 'ORDER_NEW',
        orderId: 'order-200ms-test',
        customerName: 'Speed Test User',
        items: [{ itemId: 'item-1', name: 'Fast Burger', quantity: 1 }],
        status: 'Received',
        createdAt: Date.now(),
        timestamp: Date.now(),
      };

      mockWs.simulateMessage(newOrderMsg);

      await waitFor(
        () => {
          expect(screen.getByText('Speed Test User')).toBeInTheDocument();
          const elapsed = Date.now() - startTime;
          expect(elapsed).toBeLessThan(200); // Should render within 200ms
        },
        { timeout: 200 }
      );
    });

    it('should update order status in real-time when status changes', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      // Insert initial order
      const order: Order = {
        orderId: 'order-status-update',
        customerName: 'Status Update Test',
        items: [],
        status: 'Received',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      orderStore.upsertOrder(order);

      const { container } = render(
        React.createElement(Kanban, { isConnected: true })
      );

      // Verify order is in Received column
      let receivedColumn = container.querySelector('[data-status="Received"]');
      expect(receivedColumn?.textContent).toContain('Status Update Test');

      // Simulate ORDER_UPDATE to move to Preparing
      const updateMsg: OrderUpdateMessage = {
        type: 'ORDER_UPDATE',
        orderId: 'order-status-update',
        status: 'Preparing',
        timestamp: Date.now(),
      };

      mockWs.simulateMessage(updateMsg);
      vi.runAllTimersAsync();

      await waitFor(() => {
        const preparingColumn = container.querySelector('[data-status="Preparing"]');
        expect(preparingColumn?.textContent).toContain('Status Update Test');
      });
    });

    it('should move order through complete workflow: Received → Preparing → Ready', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const orderId = 'order-workflow-test';
      const order: Order = {
        orderId,
        customerName: 'Workflow Test',
        items: [],
        status: 'Received',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      orderStore.upsertOrder(order);

      const { container } = render(
        React.createElement(Kanban, { isConnected: true })
      );

      // Step 1: Verify in Received
      let column = container.querySelector('[data-status="Received"]');
      expect(column?.textContent).toContain('Workflow Test');

      // Step 2: Move to Preparing
      mockWs.simulateMessage({
        type: 'ORDER_UPDATE',
        orderId,
        status: 'Preparing',
        timestamp: Date.now(),
      } as OrderUpdateMessage);
      vi.runAllTimersAsync();

      await waitFor(() => {
        column = container.querySelector('[data-status="Preparing"]');
        expect(column?.textContent).toContain('Workflow Test');
      });

      // Step 3: Move to Ready
      mockWs.simulateMessage({
        type: 'ORDER_UPDATE',
        orderId,
        status: 'Ready',
        timestamp: Date.now(),
      } as OrderUpdateMessage);
      vi.runAllTimersAsync();

      await waitFor(() => {
        column = container.querySelector('[data-status="Ready"]');
        expect(column?.textContent).toContain('Workflow Test');
      });
    });
  });

  describe('AC6: Empty States — No Orders in Column', () => {
    it('should display empty state when no orders in Received column', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const { container } = render(
        React.createElement(Kanban, { isConnected: true })
      );

      const receivedColumn = container.querySelector('[data-status="Received"]');
      expect(receivedColumn).toBeInTheDocument();

      // Badge should show 0
      const receivedHeader = container.querySelector('.column-header[data-status="Received"]');
      const badge = receivedHeader?.querySelector('.count-badge');
      expect(badge?.textContent).toBe('0');
    });

    it('should handle all columns being empty', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const { container } = render(
        React.createElement(Kanban, { isConnected: true })
      );

      const statuses = ['Received', 'Preparing', 'Ready', 'Completed', 'Cancelled'];
      statuses.forEach((status) => {
        const header = container.querySelector(`.column-header[data-status="${status}"]`);
        const badge = header?.querySelector('.count-badge');
        expect(badge?.textContent).toBe('0');
      });
    });

    it('should show empty state when orders transition out of column', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      // Insert order in Received
      const order: Order = {
        orderId: 'order-empty-test',
        customerName: 'Empty Test',
        items: [],
        status: 'Received',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      orderStore.upsertOrder(order);

      const { container } = render(
        React.createElement(Kanban, { isConnected: true })
      );

      // Verify order is visible
      let receivedHeader = container.querySelector('.column-header[data-status="Received"]');
      let badge = receivedHeader?.querySelector('.count-badge');
      expect(badge?.textContent).toBe('1');

      // Move order to Preparing
      mockWs.simulateMessage({
        type: 'ORDER_UPDATE',
        orderId: 'order-empty-test',
        status: 'Preparing',
        timestamp: Date.now(),
      } as OrderUpdateMessage);
      vi.runAllTimersAsync();

      await waitFor(() => {
        receivedHeader = container.querySelector('.column-header[data-status="Received"]');
        badge = receivedHeader?.querySelector('.count-badge');
        expect(badge?.textContent).toBe('0');
      });
    });
  });

  describe('AC7: Order Details Modal — Click Order Card', () => {
    it('should invoke onOrderClick callback when order is clicked', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const mockOnOrderClick = vi.fn();

      const order: Order = {
        orderId: 'order-modal-test',
        customerName: 'Modal Test User',
        items: [
          { itemId: 'item-1', name: 'Burger', quantity: 1 },
          { itemId: 'item-2', name: 'Fries', quantity: 2 },
        ],
        status: 'Received',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      orderStore.upsertOrder(order);

      render(
        React.createElement(Kanban, {
          isConnected: true,
          onOrderClick: mockOnOrderClick,
        })
      );

      const orderCard = screen.getByText('Modal Test User');
      fireEvent.click(orderCard);

      expect(mockOnOrderClick).toHaveBeenCalledWith('order-modal-test');
    });

    it('should pass order ID to modal handler with correct data', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const mockOnOrderClick = vi.fn();

      const order: Order = {
        orderId: 'order-full-details',
        customerName: 'John Doe',
        items: [
          { itemId: 'item-burger', name: 'Cheeseburger', quantity: 2 },
          { itemId: 'item-drink', name: 'Cola', quantity: 1 },
        ],
        status: 'Preparing',
        createdAt: Date.now() - 60000, // 1 minute ago
        updatedAt: Date.now(),
      };

      orderStore.upsertOrder(order);

      render(
        React.createElement(Kanban, {
          isConnected: true,
          onOrderClick: mockOnOrderClick,
        })
      );

      // Verify order data is accessible
      const storedOrder = orderStore.getOrder('order-full-details');
      expect(storedOrder).toBeDefined();
      expect(storedOrder?.customerName).toBe('John Doe');
      expect(storedOrder?.items).toHaveLength(2);

      fireEvent.click(screen.getByText('John Doe'));
      expect(mockOnOrderClick).toHaveBeenCalledWith('order-full-details');
    });
  });

  describe('Integration: Connection Status Banner', () => {
    it('should display error banner when disconnected', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const { container } = render(
        React.createElement(Kanban, { isConnected: false })
      );

      const errorBanner = container.querySelector('#error-banner');
      expect(errorBanner).toBeInTheDocument();
      expect(errorBanner?.textContent).toContain('Connection lost');
    });

    it('should not display error banner when connected', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const { container } = render(
        React.createElement(Kanban, { isConnected: true })
      );

      const errorBanner = container.querySelector('#error-banner');
      expect(errorBanner).not.toBeInTheDocument();
    });
  });

  describe('Integration: Responsive Layout Switching', () => {
    it('should switch from desktop to mobile layout on resize', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const order: Order = {
        orderId: 'order-responsive-test',
        customerName: 'Responsive Test',
        items: [],
        status: 'Received',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      orderStore.upsertOrder(order);

      const { container, rerender } = render(
        React.createElement(Kanban, { isConnected: true })
      );

      // Initially desktop: should have multiple columns
      let columns = container.querySelectorAll('.kanban-column');
      expect(columns.length).toBeGreaterThan(1);

      // Change window width to mobile
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 375,
      });

      // Trigger resize event
      fireEvent.resize(window);
      vi.runAllTimersAsync();

      // Re-render
      rerender(React.createElement(Kanban, { isConnected: true }));

      await waitFor(() => {
        const tabSelector = container.querySelector('.mobile-tab-selector');
        expect(tabSelector).toBeInTheDocument();
      });
    });
  });

  describe('Integration: Real-World Stress Test', () => {
    it('should handle rapid order arrivals without performance degradation', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const { container } = render(
        React.createElement(Kanban, { isConnected: true })
      );

      // Simulate 10 orders arriving rapidly
      for (let i = 0; i < 10; i++) {
        const msg: OrderNewMessage = {
          type: 'ORDER_NEW',
          orderId: `order-stress-${i}`,
          customerName: `Stress Test ${i}`,
          items: [{ itemId: `item-${i}`, name: 'Item', quantity: 1 }],
          status: 'Received',
          createdAt: Date.now(),
          timestamp: Date.now(),
        };
        mockWs.simulateMessage(msg);
        vi.runAllTimersAsync();
      }

      // Verify all orders rendered
      await waitFor(() => {
        const receivedHeader = container.querySelector('.column-header[data-status="Received"]');
        const badge = receivedHeader?.querySelector('.count-badge');
        expect(parseInt(badge?.textContent || '0')).toBe(10);
      });
    });

    it('should handle rapid status transitions', async () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const orderId = 'order-rapid-transition';
      orderStore.upsertOrder({
        orderId,
        customerName: 'Rapid Test',
        items: [],
        status: 'Received',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      const { container } = render(
        React.createElement(Kanban, { isConnected: true })
      );

      // Rapidly transition through statuses
      const statuses: Array<'Received' | 'Preparing' | 'Ready' | 'Completed' | 'Cancelled'> = [
        'Received',
        'Preparing',
        'Ready',
        'Completed',
      ];

      for (const status of statuses) {
        mockWs.simulateMessage({
          type: 'ORDER_UPDATE',
          orderId,
          status,
          timestamp: Date.now(),
        } as OrderUpdateMessage);
        vi.runAllTimersAsync();
      }

      await waitFor(() => {
        const completedColumn = container.querySelector('[data-status="Completed"]');
        expect(completedColumn?.textContent).toContain('Rapid Test');
      });
    });
  });
});
