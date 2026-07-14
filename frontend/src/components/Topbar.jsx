const THEME = {
  bg: '#0a0812',
  border: '#251f3a',
  text: '#fdebd0',
  text2: '#9a7e5a',
  bg3: '#171528',
  accent: '#c0152a',
  accentGlow: '#c0152a55',
};

export default function Topbar({ drawerOpen, setDrawerOpen, emailPanelOpen, setEmailPanelOpen, unreadCount = 0 }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', height: '50px', flexShrink: 0, zIndex: 10,
      position: 'relative',
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

      <div onClick={() => {
        setDrawerOpen(prev => !prev);
        setEmailPanelOpen(false); // close email if session opens
      }} style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        borderRadius: '8px', padding: '5px 12px', cursor: 'pointer',
        border: `1px solid ${THEME.border}`, background: THEME.bg3, color: THEME.text2,
      }}>
        <i className={`ti ${drawerOpen ? 'ti-layout-sidebar-left-collapse' : 'ti-layout-sidebar-left-expand'}`} style={{ fontSize: '14px' }} aria-hidden="true" />
        <span style={{ fontSize: '12px' }}>sessions</span>
        <i className="ti ti-chevron-down" style={{ fontSize: '14px' }} aria-hidden="true" />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {/* Email Icon with Badge */}
        <button
          onClick={() => {
            setEmailPanelOpen(prev => !prev);
            setDrawerOpen(false); // close sessions if email opens
          }}
          style={{
            width: '30px', height: '30px', borderRadius: '8px',
            border: `1px solid ${emailPanelOpen ? THEME.accent : THEME.border}`,
            background: emailPanelOpen ? 'rgba(192,21,42,0.1)' : 'transparent',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: emailPanelOpen ? THEME.accent : THEME.text2,
            position: 'relative',
            transition: 'all 0.18s',
          }}
          title="Gmail Integration"
        >
          <i className="ti ti-mail" style={{ fontSize: '15px' }} aria-hidden="true" />
          {unreadCount > 0 && (
            <span style={{
              position: 'absolute', top: '-4px', right: '-4px',
              background: THEME.accent, color: '#fff', fontSize: '9px',
              fontWeight: 700, borderRadius: '10px', minWidth: '15px',
              height: '15px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', padding: '0 3px', border: `2px solid ${THEME.bg}`,
            }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {['ti-settings'].map((icon, i) => (
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
