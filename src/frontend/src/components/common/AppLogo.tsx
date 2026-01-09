interface AppLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export function AppLogo({ size = 'md' }: AppLogoProps) {
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16 md:w-20 md:h-20'
  };

  return (
    <img
      src="/favicon.svg"
      alt="Kamizo"
      className={`${sizeClasses[size]} object-contain`}
    />
  );
}
