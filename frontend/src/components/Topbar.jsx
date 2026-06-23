const THEME = {
  bg: '#0a0812',
  border: '#251f3a',
  text: '#fdebd0',
  text2: '#9a7e5a',
  bg3: '#171528',
  accent: '#c0152a',
  accentGlow: '#c0152a55',
};

export default function Topbar({ drawerOpen, setDrawerOpen }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', height: '50px', flexShrink: 0, zIndex: 10,
      borderBottom: `1px solid ${THEME.border}`, background: THEME.bg,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '8px', height: '8px', borderRadius: '50%',
          background: THEME.accent, boxShadow: `0 0 10px ${THEME.accentGlow}`,
        }} />
        <span style={{ fontSize: '14px', fontWeight: 500, letterSpacing: '0.02em', color: THEME.text }}>
          virtual assist
        </span>
      </div>

      <div onClick={() => setDrawerOpen(prev => !prev)} style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        borderRadius: '8px', padding: '5px 12px', cursor: 'pointer',
        border: `1px solid ${THEME.border}`, background: THEME.bg3, color: THEME.text2,
      }}>
        <i className={`ti ${drawerOpen ? 'ti-layout-sidebar-left-collapse' : 'ti-layout-sidebar-left-expand'}`} style={{ fontSize: '14px' }} aria-hidden="true" />
        <span style={{ fontSize: '12px' }}>sessions</span>
        <i className="ti ti-chevron-down" style={{ fontSize: '14px' }} aria-hidden="true" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {['ti-paperclip', 'ti-settings'].map((icon, i) => (
          <button key={i} style={{
            width: '30px', height: '30px', borderRadius: '8px',
            border: `1px solid ${THEME.border}`, background: 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.text2,
          }}>
            <i className={`ti ${icon}`} style={{ fontSize: '15px' }} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}