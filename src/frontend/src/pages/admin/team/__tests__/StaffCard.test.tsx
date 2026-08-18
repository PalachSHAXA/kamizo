import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StaffCard } from '../StaffCard';

describe('StaffCard touch targets', () => {
  it('keeps phone and delete actions at least 44px without enlarging the compact card', () => {
    render(
      <StaffCard
        member={{
          id: 'staff-1',
          name: 'Nodir Rahimov',
          login: 'n.rahimov',
          phone: '+998901234567',
          role: 'manager',
          created_at: '2026-08-01T00:00:00.000Z',
        }}
        onOpen={vi.fn()}
        onDelete={vi.fn()}
        getSpecLabel={() => ''}
        getStatusBadge={() => null}
      />,
    );

    expect(screen.getByRole('link', { name: 'Позвонить +998901234567' })).toHaveClass('min-h-[44px]');
    expect(screen.getByRole('button', { name: 'Удалить сотрудника' })).toHaveClass('min-w-[44px]', 'min-h-[44px]');
  });
});
