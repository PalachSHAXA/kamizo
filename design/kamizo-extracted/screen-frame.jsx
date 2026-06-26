// screen-frame.jsx — centers a single screen in an iPhone frame on a neutral bg.
// Used by the per-screen standalone HTML files in /screens.
function ScreenFrame({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#e8e2d6', boxSizing: 'border-box' }}>
      <div style={{ width: 402, height: 874, position: 'relative' }}>
        <IOSDevice width={402} height={874}>
          <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>{children}</div>
        </IOSDevice>
      </div>
    </div>
  );
}
Object.assign(window, { ScreenFrame });
