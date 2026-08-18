import { resetApiSession } from '../services/api/client';
import { clearSessionStorage } from '../services/sessionStorage';
import { resetRegisteredSessionStores } from './sessionRegistry';

export function prepareSessionBoundary(): void {
  resetApiSession();
  clearSessionStorage();
}

export function resetSessionScopedState(): void {
  prepareSessionBoundary();
  resetRegisteredSessionStores();
}
