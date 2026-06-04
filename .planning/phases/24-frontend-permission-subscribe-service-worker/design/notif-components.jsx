// Phase 24 — Notifications surfaces (wireframe).
// Reuses tx-shared.jsx primitives (PALETTE, PALETTE_LIGHT, Icon, BrandMark, fmt).
// Contract source: .planning/phases/24-frontend-permission-subscribe-service-worker/24-UI-SPEC.md

// ─────────────────────────────────────────────────────────────
// Extra Tabler-style icons not in tx-shared
// ─────────────────────────────────────────────────────────────
const NIcon = {
  Bell: (p) => <svg width={p.size||20} height={p.size||20} viewBox="0 0 24 24" fill="none" stroke={p.color||'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 5a2 2 0 014 0 7 7 0 014 6v3a4 4 0 002 3H4a4 4 0 002-3v-3a7 7 0 014-6"/><path d="M9 17v1a3 3 0 006 0v-1"/></svg>,
  BellOff: (p) => <svg width={p.size||20} height={p.size||20} viewBox="0 0 24 24" fill="none" stroke={p.color||'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l18 18"/><path d="M17 17H4a4 4 0 002-3v-3c0-1.2.3-2.3.9-3.3M8.4 4.4A2 2 0 0114 5a7 7 0 014 6v3"/><path d="M9 17v1a3 3 0 006 0v-1"/></svg>,
  Logout: (p) => <svg width={p.size||20} height={p.size||20} viewBox="0 0 24 24" fill="none" stroke={p.color||'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 8V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2h7a2 2 0 002-2v-2"/><path d="M9 12h12m0 0l-3-3m3 3l-3 3"/></svg>,
  Import: (p) => <svg width={p.size||20} height={p.size||20} viewBox="0 0 24 24" fill="none" stroke={p.color||'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v6H4zM4 14h7M4 18h7"/><path d="M18 13v8m0 0l-3-3m3 3l3-3"/></svg>,
  UserPlus: (p) => <svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke={p.color||'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5 6-5s6 1.7 6 5"/><path d="M19 8v6m3-3h-6"/></svg>,
  Check: (p) => <svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke={p.color||'currentColor'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7"/></svg>,
  XError: (p) => <svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke={p.color||'currentColor'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M7 7l10 10M17 7L7 17"/></svg>,
  Close: (p) => <svg width={p.size||14} height={p.size||14} viewBox="0 0 24 24" fill="none" stroke={p.color||'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>,
  Sun: (p) => <svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke={p.color||'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>,
};

// Helper copy per state (OD-3: short on mobile, full on desktop)
const N_HELP = {
  default:     { full: 'Toque para ativar',                                    short: 'Toque para ativar' },
  requesting:  { full: 'Aguardando permissão...',                              short: 'Aguardando...' },
  enabled:     { full: 'Ativadas neste dispositivo',                           short: 'Ativadas' },
  denied:      { full: 'Bloqueadas — ative nas configurações do navegador',    short: 'Bloqueadas pelo navegador' },
  unsupported: { full: 'Não suportado neste navegador',                        short: 'Não suportado' },
};

// ─────────────────────────────────────────────────────────────
// Spinning loader (OD-1: requesting state replaces the icon)
// ─────────────────────────────────────────────────────────────
function NLoader({ size = 20, color }) {
  return (
    <svg className="nspin" width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke={color} strokeOpacity="0.25" strokeWidth="2.5"/>
      <path d="M21 12a9 9 0 00-9-9" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Mantine-style Switch (size md)
// ─────────────────────────────────────────────────────────────
function NSwitch({ checked, disabled, palette }) {
  const p = palette;
  return (
    <div style={{
      width: 36, height: 20, borderRadius: 999, flexShrink: 0,
      background: checked ? p.blue6 : p.borderStrong,
      opacity: disabled ? 0.5 : 1,
      position: 'relative', transition: 'background 120ms ease',
    }}>
      <div style={{
        position: 'absolute', top: 2, left: checked ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.25)', transition: 'left 120ms ease',
      }}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// NotificationToggleRow — the core control, 5 states
//   surface: 'mobile' | 'desktop'
// ─────────────────────────────────────────────────────────────
function NotificationToggleRow({ state = 'default', surface = 'mobile', palette }) {
  const p = palette || window.PALETTE_LIGHT;
  const checked = state === 'enabled';
  const disabled = state !== 'default' && state !== 'enabled';
  const help = N_HELP[state][surface === 'mobile' ? 'short' : 'full'];

  const helpColor = state === 'denied' ? p.red : p.dimmed;
  const iconColor = state === 'denied' ? p.red
    : state === 'enabled' ? p.text2
    : p.dimmed;

  let leftCol;
  if (state === 'requesting') leftCol = <NLoader size={20} color={p.blue6}/>;
  else if (checked) leftCol = <NIcon.Bell size={20} color={iconColor}/>;
  else leftCol = <NIcon.BellOff size={20} color={iconColor}/>;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '10px 16px', minHeight: 44, boxSizing: 'border-box',
      cursor: disabled ? 'not-allowed' : 'pointer',
    }}>
      <span style={{ display: 'flex', width: 20, justifyContent: 'center', flexShrink: 0 }}>{leftCol}</span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: p.text, lineHeight: 1.3 }}>Notificações</span>
        <span style={{ fontSize: 12, color: helpColor, lineHeight: 1.35, textWrap: 'pretty' }}>{help}</span>
      </div>
      <NSwitch checked={checked} disabled={disabled} palette={p}/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Initials avatar (UserAvatar stand-in — Mantine Avatar radius xl)
// ─────────────────────────────────────────────────────────────
function Initials({ size = 38, initials = 'MD', bg, palette }) {
  const p = palette || window.PALETTE_LIGHT;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: bg || p.blue6, color: '#fff',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.4, fontWeight: 600, letterSpacing: 0.3,
    }}>{initials}</div>
  );
}

// ─────────────────────────────────────────────────────────────
// Surface 1a — MobileMoreDrawer ("Mais") bottom-sheet w/ toggle row
// ─────────────────────────────────────────────────────────────
function MobileMoreDrawer({ state = 'default', palette }) {
  const p = palette || window.PALETTE_LIGHT;
  const { Icon } = window;

  const MoreItem = ({ icon, label, danger }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '14px 16px', color: danger ? p.red : p.text,
    }}>
      <span style={{ display: 'flex', width: 20, justifyContent: 'center' }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 500 }}>{label}</span>
    </div>
  );

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      {/* dimmed app behind */}
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.45)' }}/>
      {/* sheet */}
      <div style={{
        background: p.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16,
        paddingBottom: 30, boxShadow: '0 -8px 30px rgba(0,0,0,0.25)',
      }}>
        {/* drag handle + close */}
        <div style={{ position: 'relative', height: 28 }}>
          <div style={{
            position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
            width: 36, height: 4, borderRadius: 999, background: p.borderStrong,
          }}/>
          <div style={{
            position: 'absolute', top: 6, right: 10, width: 28, height: 28,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.dimmed,
          }}><NIcon.Close size={16}/></div>
        </div>
        {/* user header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 16px 16px' }}>
          <Initials size={38} initials="MD" palette={p}/>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: p.text }}>Mateus Deitos</div>
            <div style={{ fontSize: 12, color: p.dimmed }}>mateus@email.com</div>
          </div>
        </div>
        <div style={{ height: 1, background: p.border }}/>
        {/* items */}
        <div style={{ padding: '8px 0' }}>
          <MoreItem icon={<Icon.Users size={20}/>} label="Criar Conexão"/>
          <MoreItem icon={<NIcon.Import size={20}/>} label="Importar transações"/>
          <NotificationToggleRow state={state} surface="mobile" palette={p}/>
          <MoreItem icon={<NIcon.Logout size={20}/>} label="Sair" danger/>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Surface 1b — DesktopSidebar + open user Menu.Dropdown w/ toggle row
// ─────────────────────────────────────────────────────────────
function DesktopSidebarMenu({ state = 'default', palette }) {
  const p = palette || window.PALETTE_LIGHT;
  const { Icon, BrandMark } = window;

  const NavItem = ({ icon, label, active, badge }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
      borderRadius: 8, fontSize: 14, fontWeight: active ? 600 : 500,
      background: active ? 'rgba(86,143,179,0.18)' : 'transparent',
      color: active ? p.blue7 : p.text,
    }}>
      <span style={{ display: 'flex', color: active ? p.blue6 : p.dimmed }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge != null && (
        <span style={{
          background: p.red, color: '#fff', fontSize: 10.5, fontWeight: 700,
          padding: '1px 6px', borderRadius: 999, minWidth: 16, textAlign: 'center',
        }}>{badge}</span>
      )}
    </div>
  );

  const DropRow = ({ children }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '6px 12px' }}>{children}</div>
  );

  return (
    <div style={{ display: 'flex', height: '100%', background: p.page, color: p.text, fontFamily: '-apple-system, system-ui, sans-serif' }}>
      {/* sidebar */}
      <div style={{ width: 220, flexShrink: 0, position: 'relative', display: 'flex', flexDirection: 'column',
        background: p.surface, borderRight: `1px solid ${p.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px 14px' }}>
          <BrandMark size={28}/>
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: -0.2, color: p.blue7 }}>FinanceApp</span>
        </div>
        <div style={{ padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <NavItem icon={<Icon.Receipt2 size={18}/>} label="Transações" active/>
          <NavItem icon={<Icon.Wallet size={18}/>} label="Contas"/>
          <NavItem icon={<Icon.Tree size={18}/>} label="Categorias"/>
          <NavItem icon={<Icon.Card size={18}/>} label="Cobranças" badge={2}/>
        </div>
        <div style={{ padding: '12px 16px', marginTop: 18, borderTop: `1px solid ${p.border}`,
          fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: p.dimmed }}>Conexões</div>
        <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 8 }}>
            <Initials size={28} initials="V" bg={p.grape} palette={p}/>
            <span style={{ fontSize: 13 }}>Vic</span>
          </div>
          <NavItem icon={<NIcon.UserPlus size={18}/>} label="Criar conexão"/>
        </div>

        <div style={{ marginTop: 'auto' }}/>
        {/* user pill */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 16px',
          borderTop: `1px solid ${p.border}` }}>
          <Initials size={38} initials="MD" palette={p}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: p.text }}>Mateus</div>
            <div style={{ fontSize: 11, color: p.dimmed, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>mateus@email.com</div>
          </div>
          <Icon.ChevD size={14}/>
        </div>

        {/* open Menu.Dropdown (position top-start, width target) */}
        <div style={{
          position: 'absolute', left: 12, bottom: 70, width: 196,
          background: p.surface, border: `1px solid ${p.border}`, borderRadius: 8,
          boxShadow: '0 1px 3px rgba(10,13,18,0.05), 0 20px 25px -5px rgba(10,13,18,0.12)',
          padding: '4px 0', zIndex: 5,
        }}>
          <div style={{ padding: '6px 12px', fontSize: 11, color: p.dimmed, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>mateus@email.com</div>
          <DropRow>
            <span style={{ fontSize: 14, color: p.text }}>Tema</span>
            <div style={{ width: 34, height: 30, border: `1px solid ${p.border}`, borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.text2 }}>
              <NIcon.Sun size={18}/>
            </div>
          </DropRow>
          {/* NEW: notification toggle row */}
          <NotificationToggleRow state={state} surface="desktop" palette={p}/>
          <div style={{ height: 1, background: p.border, margin: '4px 0' }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', color: p.red, fontSize: 14 }}>
            <NIcon.Logout size={16}/><span>Sair</span>
          </div>
        </div>
      </div>

      {/* main area placeholder (kept faint so the menu is the focus) */}
      <div style={{ flex: 1, padding: 24, opacity: 0.5 }}>
        <div style={{ height: 32, width: 180, borderRadius: 6, background: p.surface, border: `1px solid ${p.border}` }}/>
        <div style={{ marginTop: 16, border: `1px solid ${p.border}`, borderRadius: 8, overflow: 'hidden', background: p.surface }}>
          {[0,1,2,3,4].map(i => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 18px', borderBottom: i < 4 ? `1px solid ${p.border}` : 'none' }}>
              <div style={{ height: 12, width: 160, borderRadius: 4, background: p.border }}/>
              <div style={{ height: 12, width: 70, borderRadius: 4, background: p.border }}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Surface 3 — Toast (Mantine notifications, top-right)
// ─────────────────────────────────────────────────────────────
function Toast({ tone = 'teal', title, message, palette }) {
  const p = palette || window.PALETTE_LIGHT;
  const accent = tone === 'teal' ? p.teal : p.red;
  return (
    <div style={{
      width: 348, background: p.surface, borderRadius: 8,
      boxShadow: '0 1px 3px rgba(10,13,18,0.05), 0 10px 15px -5px rgba(10,13,18,0.12)',
      border: `1px solid ${p.border}`, display: 'flex', gap: 12, padding: 16,
      position: 'relative', borderLeft: `4px solid ${accent}`,
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%', background: accent, color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
      }}>
        {tone === 'teal' ? <NIcon.Check size={14}/> : <NIcon.XError size={14}/>}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: p.text }}>{title}</div>
        <div style={{ fontSize: 13, color: p.text2, marginTop: 3, lineHeight: 1.4, textWrap: 'pretty' }}>{message}</div>
      </div>
      <div style={{ color: p.dimmed, flexShrink: 0 }}><NIcon.Close size={14}/></div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Surface 4 — OS / browser push notification card
// ─────────────────────────────────────────────────────────────
function OSPush({ title, body, target, palette }) {
  const p = palette || window.PALETTE_LIGHT;
  const { BrandMark } = window;
  return (
    <div style={{ width: 360, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{
        background: p.surface, borderRadius: 14, border: `1px solid ${p.border}`,
        boxShadow: '0 6px 20px rgba(0,0,0,0.12)', padding: 14, display: 'flex', gap: 12,
      }}>
        <div style={{ flexShrink: 0 }}><BrandMark size={38}/></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: p.dimmed, textTransform: 'uppercase', letterSpacing: '0.03em' }}>FinanceApp</span>
            <span style={{ fontSize: 12, color: p.dimmed }}>agora</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 600, color: p.text, marginTop: 2 }}>{title}</div>
          <div style={{ fontSize: 14, color: p.text2, marginTop: 2, lineHeight: 1.4, textWrap: 'pretty' }}>{body}</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 4, fontSize: 11, color: p.dimmed, fontFamily: 'var(--fa-font-mono, monospace)' }}>
        <span>toque abre →</span>
        <span style={{ fontWeight: 600, color: p.blue7 }}>{target}</span>
      </div>
    </div>
  );
}

Object.assign(window, {
  NIcon, NLoader, NSwitch, NotificationToggleRow, Initials,
  MobileMoreDrawer, DesktopSidebarMenu, Toast, OSPush,
});
