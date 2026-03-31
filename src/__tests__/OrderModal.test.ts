/**
 * Tests for OrderModal Component
 * 
 * Coverage:
 * - Modal opening/closing
 * - Status badge colors
 * - Order details display
 * - Keyboard interaction (Escape key)
 * - Click-outside dismissal
 * - Action button integration
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Order } from '../types';
import { OrderModal } from '../components/OrderModal';

// Mock ActionButtons component
vi.mock('../components/ActionButtons', () => ({
  ActionButtons: ({ order }: { order: Order }) => (
    <div data-testid="action-buttons">
      {order.status === 'Received' && <button>Accept</button>}
      {order.status === 'Preparing' && <button>Mark Ready</button>}
      {order.status === 'Ready' && <button>Mark Complete</button>}
      {order.status === 'Completed' && <button>Dismiss</button>}
      {order.status === 'Cancelled' && <button>Dismiss</button>}
    </div>
  ),
}));

describe('OrderModal - Modal State', () => {
  let mockOnClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnClose = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when isOpen is false', () => {
    const order: Order = {
      orderId: '1',
      customerName: 'Test',
      items: [],
      status: 'Received',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const { container } = render(
      <OrderModal order={order} isOpen={false} onClose={mockOnClose} />
    );

    const dialog = container.querySelector('dialog');
    expect(dialog).not.toBeInTheDocument();
  });

  it('should render when isOpen is true', () => {
    const order: Order = {
      orderId: '1',
      customerName: 'Test',
      items: [],
      status: 'Received',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const { container } = render(
      <OrderModal order={order} isOpen={true} onClose={mockOnClose} />
    );

    const dialog = container.querySelector('dialog');
    expect(dialog).toBeInTheDocument();
  });

  it('should not render when order is null', () => {
    const { container } = render(
      <OrderModal order={null} isOpen={true} onClose={mockOnClose} />
    );

    const dialog = container.querySelector('dialog');
    expect(dialog).not.toBeInTheDocument();
  });
});

describe('OrderModal - Content Display', () => {
  let mockOnClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnClose = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should display order ID in header', () => {
    const order: Order = {
      orderId: '12847',
      customerName: 'John Smith',
      items: [],
      status: 'Received',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(<OrderModal order={order} isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText(/Order #12847/)).toBeInTheDocument();
  });

  it('should display customer name', () => {
    const order: Order = {
      orderId: '1',
      customerName: 'Alice Cooper',
      items: [],
      status: 'Received',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(<OrderModal order={order} isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText('Alice Cooper')).toBeInTheDocument();
  });

  it('should display all items with quantities', () => {
    const order: Order = {
      orderId: '1',
      customerName: 'Test',
      items: [
        { itemId: '1', name: 'Burger', quantity: 1 },
        { itemId: '2', name: 'Fries', quantity: 2 },
        { itemId: '3', name: 'Coke', quantity: 1 },
      ],
      status: 'Received',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(<OrderModal order={order} isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText('Burger')).toBeInTheDocument();
    expect(screen.getByText('x1')).toBeInTheDocument();
    expect(screen.getByText('Fries')).toBeInTheDocument();
    expect(screen.getByText('x2')).toBeInTheDocument();
    expect(screen.getByText('Coke')).toBeInTheDocument();
  });

  it('should display status label', () => {
    const order: Order = {
      orderId: '1',
      customerName: 'Test',
      items: [],
      status: 'Received',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(<OrderModal order={order} isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText(/Status/i)).toBeInTheDocument();
  });

  it('should display created time', () => {
    const createdAt = new Date('2024-01-15T14:32:15').getTime();
    const order: Order = {
      orderId: '1',
      customerName: 'Test',
      items: [],
      status: 'Received',
      createdAt,
      updatedAt: createdAt,
    };

    render(<OrderModal order={order} isOpen={true} onClose={mockOnClose} />);

    expect(screen.getByText(/Created|Timing/)).toBeInTheDocument();
  });
});

describe('OrderModal - Status Badge Colors', () => {
  let mockOnClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnClose = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should display Received status with orange color', () => {
    const order: Order = {
      orderId: '1',
      customerName: 'Test',
      items: [],
      status: 'Received',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const { container } = render(
      <OrderModal order={order} isOpen={true} onClose={mockOnClose} />
    );

    const statusBadge = container.querySelector('[style*="backgroundColor"]');
    expect(statusBadge).toHaveStyle({ backgroundColor: '#ff9800' });
  });

  it('should display Preparing status with blue color', () => {
    const order: Order = {
      orderId: '1',
      customerName: 'Test',
      items: [],
      status: 'Preparing',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const { container } = render(
      <OrderModal order={order} isOpen={true} onClose={mockOnClose} />
    );

    const statusBadge = container.querySelector('[style*="backgroundColor"]');
    expect(statusBadge).toHaveStyle({ backgroundColor: '#2196f3' });
  });

  it('should display Ready status with green color', () => {
    const order: Order = {
      orderId: '1',
      customerName: 'Test',
      items: [],
      status: 'Ready',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const { container } = render(
      <OrderModal order={order} isOpen={true} onClose={mockOnClose} />
    );

    const statusBadge = container.querySelector('[style*="backgroundColor"]');
    expect(statusBadge).toHaveStyle({ backgroundColor: '#4caf50' });
  });

  it('should display Completed status with purple color', () => {
    const order: Order = {
      orderId: '1',
      customerName: 'Test',
      items: [],
      status: 'Completed',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const { container } = render(
      <OrderModal order={order} isOpen={true} onClose={mockOnClose} />
    );

    const statusBadge = container.querySelector('[style*="backgroundColor"]');
    expect(statusBadge).toHaveStyle({ backgroundColor: '#9c27b0' });
  });

  it('should display Cancelled status with red color', () => {
    const order: Order = {
      orderId: '1',
      customerName: 'Test',
      items: [],
      status: 'Cancelled',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const { container } = render(
      <OrderModal order={order} isOpen={true} onClose={mockOnClose} />
    );

    const statusBadge = container.querySelector('[style*="backgroundColor"]');
    expect(statusBadge).toHaveStyle({ backgroundColor: '#f44336' });
  });
});

describe('OrderModal - Close Interactions', () => {
  let mockOnClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnClose = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should close when close button is clicked', () => {
    const order: Order = {
      orderId: '1',
      customerName: 'Test',
      items: [],
      status: 'Received',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(<OrderModal order={order} isOpen={true} onClose={mockOnClose} />);

    const closeButton = screen.getByLabelText(/Close modal/);
    fireEvent.click(closeButton);

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should close when overlay is clicked', () => {
    const order: Order = {
      orderId: '1',
      customerName: 'Test',
      items: [],
      status: 'Received',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const { container } = render(
      <OrderModal order={order} isOpen={true} onClose={mockOnClose} />
    );

    const overlay = container.querySelector('[role="presentation"]');
    if (overlay) {
      fireEvent.click(overlay);
    }

    expect(mockOnClose).toHaveBeenCalled();
  });

  it('should close when Escape key is pressed', async () => {
    const order: Order = {
      orderId: '1',
      customerName: 'Test',
      items: [],
      status: 'Received',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(<OrderModal order={order} isOpen={true} onClose={mockOnClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  it('should not close when clicking inside modal content', () => {
    const order: Order = {
      orderId: '1',
      customerName: 'Test',
      items: [],
      status: 'Received',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(<OrderModal order={order} isOpen={true} onClose={mockOnClose} />);

    const content = screen.getByText('Test');
    fireEvent.click(content);

    expect(mockOnClose).not.toHaveBeenCalled();
  });
});

describe('OrderModal - Accessibility', () => {
  let mockOnClose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockOnClose = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should have proper dialog role', () => {
    const order: Order = {
      orderId: '1',
      customerName: 'Test',
      items: [],
      status: 'Received',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const { container } = render(
      <OrderModal order={order} isOpen={true} onClose={mockOnClose} />
    );

    const dialog = container.querySelector('dialog');
    expect(dialog).toHaveAttribute('id', 'detail-modal');
  });

  it('should have aria-label on status badge', () => {
    const order: Order = {
      orderId: '1',
      customerName: 'Test',
      items: [],
      status: 'Received',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    render(<OrderModal order={order} isOpen={true} onClose={mockOnClose} />);

    const statusBadge = screen.getByLabelText(/Current status/);
    expect(statusBadge).toBeInTheDocument();
  });
});
