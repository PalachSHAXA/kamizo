// Shared helpers for marketplace routes

export function generateCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I,O,0,1 to avoid confusion
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function isAdvertiser(user: any): boolean {
  return user?.account_type === 'advertiser' || user?.role === 'advertiser';
}

export function isMarketplaceAdmin(role: string): boolean {
  return ['admin', 'director', 'manager', 'marketplace_manager'].includes(role);
}
