// Централизованные предикаты для ролевых проверок, чтобы одну и ту же семантику
// не переопределять по месту (иначе BottomBar/Sidebar/route-guard расходятся —
// был реальный баг: BottomBar показывал QR-таб охраннику (executor+spec:security),
// а ProtectedRoute на /qr-scanner проверял только role → тап molча уводил на /).

interface UserLike {
  role?: string | null;
  specialization?: string | null;
}

/**
 * "Охранник" в системе Kamizo — двух типов:
 *   • role === 'security'                      — выделенная роль охраны.
 *   • role === 'executor' + spec === 'security' — исполнитель, специализирующийся на охране (типичный кейс на myhelper).
 * Обоим нужен один и тот же доступ (QR-сканер пропусков, вход на КПП, и т.п.).
 */
export function isSecurityRole(user: UserLike | null | undefined): boolean {
  if (!user) return false;
  return user.role === 'security' || user.specialization === 'security';
}
