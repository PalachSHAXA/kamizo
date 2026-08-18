import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import { Keyboard } from '@capacitor/keyboard'
import './index.css'
import { prepareSessionBoundary } from './stores/sessionReset'
import { API_URL, transformUser, type UserApiResponse } from './services/api/client'

interface ImpersonationExchangeResponse {
  user: UserApiResponse & {
    tenant_id?: string | null
    account_type?: string | null
  }
  token: string
  tenantName?: string
  originUrl?: string
}

export async function installImpersonationExchange(
  reload: () => void = () => window.location.reload(),
): Promise<boolean> {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('impersonation_code')
  if (!code) return false

  params.delete('impersonation_code')
  const cleanUrl = window.location.pathname
    + (params.toString() ? `?${params.toString()}` : '')
    + window.location.hash
  window.history.replaceState({}, '', cleanUrl)
  prepareSessionBoundary()

  try {
    const response = await fetch(`${API_URL}/api/auth/impersonation-exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
    if (!response.ok) return false

    const exchanged = await response.json() as ImpersonationExchangeResponse
    if (!exchanged?.user || typeof exchanged.token !== 'string' || !exchanged.token) return false

    const user = transformUser(exchanged.user)
    localStorage.setItem('uk-auth-storage', JSON.stringify({
      state: { user, token: exchanged.token },
      version: 4,
    }))
    localStorage.setItem('auth_token', exchanged.token)
    localStorage.setItem('kamizo_impersonation', JSON.stringify({
      origin_url: exchanged.originUrl || '',
      tenant_name: exchanged.tenantName || '',
    }))
    reload()
    return true
  } catch {
    prepareSessionBoundary()
    return false
  }
}

function setIOSPwaGap() {
  const gap = Math.max(0, window.screen.height - window.innerHeight)
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as unknown as { standalone?: boolean }).standalone === true
  document.documentElement.style.setProperty(
    '--ios-pwa-gap',
    standalone && gap > 0 ? `${gap}px` : '0px'
  )
}

export async function bootstrap(reload?: () => void) {
  if (await installImpersonationExchange(reload)) return

  if (Capacitor.isNativePlatform()) {
    Keyboard.setAccessoryBarVisible({ isVisible: false }).catch(() => {})
  }
  setIOSPwaGap()
  ;['resize', 'orientationchange', 'pageshow'].forEach(e =>
    window.addEventListener(e, setIOSPwaGap)
  )

  const { default: App } = await import('./App.tsx')
  const rootEl = document.getElementById('root')!
  rootEl.classList.add('app-booting')
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      rootEl.classList.add('app-mounted')
      window.setTimeout(() => {
        rootEl.classList.remove('app-booting', 'app-mounted')
      }, 600)
    })
  })
}

if (import.meta.env.MODE !== 'test') void bootstrap()
