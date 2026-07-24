// RU (Russia) Flag component — same shape/size defaults as UZFlag for the
// language toggle. v118.157: created to replace the 🇷🇺 emoji in the
// RU/UZ language pills (LoginPage, LanguageSwitcher, SettingsPage,
// StaffProfilePage) so the flag renders deterministically at ~20 px
// across iOS / Android / web instead of relying on the OS emoji font.
//
// Russian tricolor (State Flag of the Russian Federation, art. 1 of
// the 2000 Federal Constitutional Law):
//   • TOP band:    WHITE   #FFFFFF
//   • MIDDLE band: BLUE    #0039A6
//   • BOTTOM band: RED     #D52B1E
export function RUFlag({ className = 'w-8 h-5 sm:w-12 sm:h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 30 20" className={className}>
      <rect width="30" height="6.67" fill="#FFFFFF" />
      <rect y="6.67" width="30" height="6.67" fill="#0039A6" />
      <rect y="13.33" width="30" height="6.67" fill="#D52B1E" />
    </svg>
  );
}
