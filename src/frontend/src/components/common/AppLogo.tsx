import { useTenantStore } from '../../stores/tenantStore';

interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'xl-login';
  forceDefault?: boolean;
}

export function AppLogo({ size = 'md', forceDefault = false }: AppLogoProps) {
  const tenant = useTenantStore((s) => s.config?.tenant);

  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-14 h-14',
    xl: 'w-16 h-16 md:w-20 md:h-20',
    'xl-login': 'w-20 h-20',
  };

  if (!forceDefault && tenant?.logo) {
    return (
      <img
        src={tenant.logo}
        alt={tenant.name}
        className={`${sizeClasses[size]} flex-shrink-0 object-cover rounded-2xl`}
      />
    );
  }

  return (
    <img
      src="/icons/favicon-192x192.png"
      alt="Kamizo"
      className={`${sizeClasses[size]} flex-shrink-0 object-contain`}
    />
  );
}
