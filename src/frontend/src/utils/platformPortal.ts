export function isRoleAllowedForPlatformHost(hostname: string, role?: string): boolean {
  if (['control.kamizo.uz', 'partners.kamizo.uz', 'market.kamizo.uz', 'check.kamizo.uz'].includes(hostname)) {
    return role === 'super_admin';
  }
  return true;
}
