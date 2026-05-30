// Phase 25 — Frontend Notification Inbox (wireframe).
// Reuses tx-shared.jsx (PALETTE_LIGHT, Icon, BrandMark, fmt) + notif-components.jsx (NIcon, Initials, Toast).
// Contract source: .planning/phases/25-frontend-notification-inbox/25-UI-SPEC.md

const PARTNER = 'Vic';
const FALLBACK_PARTNER = 'Seu parceiro(a)';
const clamp2 = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' };

// formatBalance() equivalent — cents int → "R$ X.XXX,XX" (no sign prefix)
function fmtBRL(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
}

// Build the in-app description string per type (amount embedded inline, pt-BR).
// amountState: 'known' (amount resolved) · 'loading' (degrade to no-amount copy) · 'missing' (404/soft-deleted → "—")
// Mirrors Phase 23 D-07 push copy for cross-channel consistency.
function describeNotification(n, partner = PARTNER) {
  const who = partner || FALLBACK_PARTNER;
  const state = n.amountState || (n.amount != null ? 'known' : 'loading');
  const amt = state === 'missing' ? '—' : fmtBRL(n.amount);
  switch (n.type) {
    case 'charge_received':
      if (state === 'loading') return `${who} criou uma cobrança para você`;
      return n.description
        ? `${who} te cobrou ${amt}: ${n.description}`
        : `${who} te cobrou ${amt}`;
    case 'charge_accepted':
      return state === 'loading'
        ? `${who} aceitou sua cobrança`
        : `${who} aceitou sua cobrança de ${amt}`;
    case 'split_created':
      return state === 'loading'
        ? `${who} adicionou uma transação dividida`
        : `${who} adicionou uma transação dividida de ${amt}`;
    case 'split_updated':
      return state === 'loading'
        ? `${who} atualizou uma transação dividida`
        : `${who} atualizou uma transação dividida (${amt})`;
    default:
      return 'Nova notificação';
  }
}

// ─────────────────────────────────────────────────────────────
// Extra Tabler-style icons specific to the inbox
// ─────────────────────────────────────────────────────────────
const IIcon = {
  CreditCard: (p) => <svg width={p.size||20} height={p.size||20} viewBox="0 0 24 24" fill="none" stroke={p.color||'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h3"/></svg>,
  CircleCheck: (p) => <svg width={p.size||20} height={p.size||20} viewBox="0 0 24 24" fill="none" stroke={p.color||'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>,
  Users: (p) => <svg width={p.size||20} height={p.size||20} viewBox="0 0 24 24" fill="none" stroke={p.color||'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><circle cx="17" cy="7" r="2.4"/><path d="M16 20c0-2.2 2-4 4-4"/></svg>,
  Refresh: (p) => <svg width={p.size||20} height={p.size||20} viewBox="0 0 24 24" fill="none" stroke={p.color||'currentColor'} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12a8 8 0 0114-5l2 2M20 12a8 8 0 01-14 5l-2-2"/><path d="M20 4v5h-5M4 20v-5h5"/></svg>,
};

// ─────────────────────────────────────────────────────────────
// Per-type config: icon + ThemeIcon (light variant) tint/fg
// ─────────────────────────────────────────────────────────────
const NOTIF_TYPES = {
  charge_received: { Glyph: IIcon.CreditCard,  tint: 'rgba(86,143,179,0.16)',  fg: '#457b9d' },
  charge_accepted: { Glyph: IIcon.CircleCheck, tint: 'rgba(42,157,143,0.16)',  fg: '#0c8a7d' },
  split_created:   { Glyph: IIcon.Users,       tint: 'rgba(112,72,184,0.13)',  fg: '#7048b8' },
  split_updated:   { Glyph: IIcon.Refresh,     tint: 'rgba(232,89,12,0.14)',   fg: '#d5660c' },
};
const NOTIF_FALLBACK = { Glyph: () => null, tint: 'rgba(132,132,132,0.14)', fg: '#717171' };

// Sample inbox feed (newest first). Amounts in cents; description only on charge_received.
const INBOX = [
  { id: 5, type: 'split_updated',   read: false, ts: 'há 5 min',   amount: 21000 },
  { id: 4, type: 'charge_received', read: false, ts: 'há 22 min',  amount: 5000,  description: 'Aluguel' },
  { id: 3, type: 'split_created',   read: false, ts: 'há 2 horas', amount: 8490 },
  { id: 2, type: 'charge_accepted', read: true,  ts: 'ontem',      amount: 12000 },
  { id: 1, type: 'charge_received', read: true,  ts: '12/05',      amount: 3250,  description: 'Mercado' },
];

// ─────────────────────────────────────────────────────────────
// ThemeIcon — Mantine variant="light" radius="md" size 36
// ─────────────────────────────────────────────────────────────
function ThemeIcon({ tint, fg, size = 36, children }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, background: tint, color: fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>{children}</div>
  );
}

// ─────────────────────────────────────────────────────────────
// Surface 3 — Notification row
// ─────────────────────────────────────────────────────────────
function NotificationRow({ n, palette }) {
  const p = palette || window.PALETTE_LIGHT;
  const t = NOTIF_TYPES[n.type] || NOTIF_FALLBACK;
  const unread = !n.read;
  const desc = describeNotification(n);
  const { Icon } = window;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
      minHeight: 48, boxSizing: 'border-box', cursor: 'pointer',
      background: unread ? p.blue0 : 'transparent',
    }}>
      {/* unread dot OR transparent spacer — keeps alignment */}
      <span aria-hidden="true" style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: unread ? p.blue6 : 'transparent',
      }}/>
      <ThemeIcon tint={t.tint} fg={t.fg}><t.Glyph size={20}/></ThemeIcon>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.4, color: unread ? p.text : p.dimmed, ...clamp2 }}>{desc}</span>
        <span style={{ fontSize: 12, color: p.dimmed, lineHeight: 1.4 }}>{n.ts}</span>
      </div>
      <span style={{ color: p.dimmed, flexShrink: 0, display: 'flex' }}><Icon.ChevR size={16}/></span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Skeleton row (initial load)
// ─────────────────────────────────────────────────────────────
function SkeletonRow({ palette }) {
  const p = palette || window.PALETTE_LIGHT;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', minHeight: 48, boxSizing: 'border-box' }}>
      <span style={{ width: 8, flexShrink: 0 }}/>
      <div className="nshimmer" style={{ width: 36, height: 36, borderRadius: 8 }}/>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div className="nshimmer" style={{ height: 11, width: '72%', borderRadius: 4 }}/>
        <div className="nshimmer" style={{ height: 9, width: '34%', borderRadius: 4 }}/>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Mark-all-read — Mantine Button variant="subtle" size="sm"
// ─────────────────────────────────────────────────────────────
function MarkAllReadBtn({ palette }) {
  const p = palette || window.PALETTE_LIGHT;
  return (
    <div style={{
      fontSize: 14, fontWeight: 500, color: p.blue7, whiteSpace: 'nowrap',
      padding: '6px 8px', borderRadius: 8, cursor: 'pointer', flexShrink: 0,
    }}>Marcar todas como lidas</div>
  );
}

// Outline "Carregar mais" (load more)
function LoadMoreBtn({ palette }) {
  const p = palette || window.PALETTE_LIGHT;
  return (
    <div style={{ padding: '8px 16px 12px' }}>
      <div style={{
        border: `1px solid ${p.borderStrong}`, borderRadius: 8, padding: '9px 12px',
        textAlign: 'center', fontSize: 14, fontWeight: 500, color: p.text, cursor: 'pointer',
      }}>Carregar mais</div>
    </div>
  );
}

function EndIndicator({ palette }) {
  const p = palette || window.PALETTE_LIGHT;
  return <div style={{ textAlign: 'center', fontSize: 12, color: p.dimmed, padding: '14px 16px 18px' }}>Você está em dia</div>;
}

// ─────────────────────────────────────────────────────────────
// Empty / Error states
// ─────────────────────────────────────────────────────────────
function EmptyState({ palette }) {
  const p = palette || window.PALETTE_LIGHT;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '40px 28px 48px' }}>
      <ThemeIcon tint="rgba(132,132,132,0.13)" fg={p.dimmed} size={48}>
        <window.NIcon.BellOff size={24}/>
      </ThemeIcon>
      <div style={{ fontSize: 14, color: p.dimmed, textAlign: 'center', lineHeight: 1.4 }}>Nenhuma notificação por enquanto</div>
      <div style={{ fontSize: 12, color: p.dimmed, textAlign: 'center', lineHeight: 1.5, maxWidth: 280, textWrap: 'pretty' }}>As notificações de cobranças e transações divididas aparecerão aqui.</div>
    </div>
  );
}

function ErrorState({ palette }) {
  const p = palette || window.PALETTE_LIGHT;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '44px 28px 48px' }}>
      <div style={{ fontSize: 14, color: p.red, textAlign: 'center', lineHeight: 1.4 }}>Não foi possível carregar as notificações.</div>
      <div style={{
        border: `1px solid ${p.border}`, background: p.blue0, color: p.blue7,
        fontSize: 13, fontWeight: 500, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
      }}>Tentar novamente</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// InboxContent — shared list body. variant: 'populated' | 'allread' | 'loading' | 'empty' | 'error'
// ─────────────────────────────────────────────────────────────
function InboxContent({ variant = 'populated', palette }) {
  const p = palette || window.PALETTE_LIGHT;

  if (variant === 'loading') {
    return <div>{[0, 1, 2].map(i => <SkeletonRow key={i} palette={p}/>)}</div>;
  }
  if (variant === 'empty') return <EmptyState palette={p}/>;
  if (variant === 'error') return <ErrorState palette={p}/>;

  const rows = variant === 'allread' ? INBOX.map(n => ({ ...n, read: true })) : INBOX;
  return (
    <div>
      {rows.map((n, i) => (
        <div key={n.id}>
          <NotificationRow n={n} palette={p}/>
          {i < rows.length - 1 && <div style={{ height: 1, background: p.border, marginLeft: 56 }}/>}
        </div>
      ))}
      {variant === 'allread' ? <EndIndicator palette={p}/> : <LoadMoreBtn palette={p}/>}
    </div>
  );
}

// Whether the mark-all action shows for a given variant
function hasUnread(variant) { return variant === 'populated'; }

// ─────────────────────────────────────────────────────────────
// Surface 2a — Mobile inbox bottom-sheet drawer
// ─────────────────────────────────────────────────────────────
function NotificationInboxDrawer({ variant = 'populated', palette }) {
  const p = palette || window.PALETTE_LIGHT;
  const showMarkAll = hasUnread(variant);
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      {/* dimmed app behind */}
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.45)' }}/>
      {/* sheet */}
      <div style={{
        background: p.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16,
        boxShadow: '0 -8px 30px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column',
        maxHeight: '88%', paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
      }}>
        {/* drag handle */}
        <div style={{ position: 'relative', height: 22, flexShrink: 0 }}>
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', width: 36, height: 4, borderRadius: 999, background: p.borderStrong }}/>
        </div>
        {/* title bar (Mantine Drawer header: title + close) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '2px 16px 12px', flexShrink: 0 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: p.text, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Notificações</span>
          <div style={{ width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', color: p.dimmed, flexShrink: 0 }}><window.NIcon.Close size={18}/></div>
        </div>
        {/* mark-all action row (only when unread) */}
        {showMarkAll && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 8px 6px', flexShrink: 0 }}>
            <MarkAllReadBtn palette={p}/>
          </div>
        )}
        <div style={{ height: 1, background: p.border, flexShrink: 0 }}/>
        {/* scrollable list */}
        <div style={{ overflowY: 'auto', flex: '0 1 auto' }}>
          <InboxContent variant={variant} palette={p}/>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Desktop sidebar (with Notificações nav link + blue unread badge)
// ─────────────────────────────────────────────────────────────
function DesktopNav({ active = 'notifications', notifBadge, palette }) {
  const p = palette || window.PALETTE_LIGHT;
  const { Icon, BrandMark, NIcon } = window;
  const Initials = window.Initials;

  const NavItem = ({ icon, label, isActive, badge, badgeColor }) => (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8,
      fontSize: 14, fontWeight: isActive ? 600 : 500,
      background: isActive ? 'rgba(86,143,179,0.18)' : 'transparent',
      color: isActive ? p.blue7 : p.text,
    }}>
      <span style={{ display: 'flex', color: isActive ? p.blue6 : p.dimmed }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge != null && (
        <span style={{
          background: badgeColor || p.red, color: '#fff', fontSize: 10.5, fontWeight: 700,
          padding: '1px 6px', borderRadius: 999, minWidth: 16, textAlign: 'center',
        }}>{badge}</span>
      )}
    </div>
  );

  return (
    <div style={{ width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', background: p.surface, borderRight: `1px solid ${p.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 16px 14px' }}>
        <BrandMark size={28}/>
        <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: -0.2, color: p.blue7 }}>FinanceApp</span>
      </div>
      <div style={{ padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <NavItem icon={<Icon.Receipt2 size={18}/>} label="Transações"/>
        <NavItem icon={<Icon.Wallet size={18}/>} label="Contas"/>
        <NavItem icon={<Icon.Tree size={18}/>} label="Categorias"/>
        <NavItem icon={<Icon.Card size={18}/>} label="Cobranças" badge={2} badgeColor={p.red}/>
        <NavItem icon={<NIcon.Bell size={18}/>} label="Notificações" isActive={active === 'notifications'} badge={notifBadge} badgeColor={p.blue6}/>
      </div>
      <div style={{ padding: '12px 16px', marginTop: 14, borderTop: `1px solid ${p.border}`, fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: p.dimmed }}>Conexões</div>
      <div style={{ padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 12px', borderRadius: 8 }}>
          <Initials size={28} initials="V" bg={p.grape} palette={p}/>
          <span style={{ fontSize: 13 }}>Vic</span>
        </div>
      </div>
      <div style={{ marginTop: 'auto' }}/>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 16px', borderTop: `1px solid ${p.border}` }}>
        <Initials size={36} initials="MD" palette={p}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: p.text }}>Mateus</div>
          <div style={{ fontSize: 11, color: p.dimmed, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>mateus@email.com</div>
        </div>
        <Icon.ChevD size={14}/>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Surface 2b — Desktop full page /notifications inside AppShell.Main
// ─────────────────────────────────────────────────────────────
function DesktopInboxPage({ variant = 'populated', notifBadge = 3, palette }) {
  const p = palette || window.PALETTE_LIGHT;
  const showMarkAll = hasUnread(variant);
  return (
    <div style={{ display: 'flex', height: '100%', background: p.page, color: p.text, fontFamily: '-apple-system, system-ui, sans-serif' }}>
      <DesktopNav active="notifications" notifBadge={notifBadge} palette={p}/>
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '28px 32px' }}>
        <div style={{ maxWidth: 620 }}>
          {/* page heading + mark-all */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: p.text }}>Notificações</span>
            {showMarkAll && <MarkAllReadBtn palette={p}/>}
          </div>
          <div style={{ height: 1, background: p.border, marginBottom: 4 }}/>
          {/* list card-less, hairline separators (matches list pattern) */}
          <div style={{ background: p.surface, border: `1px solid ${p.border}`, borderRadius: 8, overflow: 'hidden' }}>
            <InboxContent variant={variant} palette={p}/>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Surface 1 — Mobile tab bar w/ OD-4 "Mais" unread dot indicator
// ─────────────────────────────────────────────────────────────
function MobileTabBar({ moreUnread = false, palette }) {
  const p = palette || window.PALETTE_LIGHT;
  const { Icon } = window;
  const Tab = ({ glyph, label, active, redBadge, blueDot }) => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, position: 'relative', color: active ? p.blue6 : p.dimmed }}>
      <div style={{ position: 'relative' }}>
        {glyph}
        {redBadge != null && (
          <span style={{ position: 'absolute', top: -5, right: -9, background: p.red, color: '#fff', fontSize: 9.5, fontWeight: 700, minWidth: 15, height: 15, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', boxSizing: 'border-box' }}>{redBadge}</span>
        )}
        {blueDot && (
          <span style={{ position: 'absolute', top: -3, right: -5, width: 9, height: 9, borderRadius: '50%', background: p.blue6, border: `2px solid ${p.surface}` }}/>
        )}
      </div>
      <span style={{ fontSize: 10.5, fontWeight: 500, letterSpacing: -0.1 }}>{label}</span>
    </div>
  );
  return (
    <div style={{
      width: '100%', boxSizing: 'border-box', background: p.surface, borderTop: `1px solid ${p.border}`,
      display: 'flex', alignItems: 'center', padding: '8px 6px 10px',
    }}>
      <Tab glyph={<Icon.Receipt2 size={22}/>} label="Transações" active/>
      <Tab glyph={<Icon.Wallet size={22}/>} label="Contas"/>
      <Tab glyph={<Icon.Tree size={22}/>} label="Categorias"/>
      <Tab glyph={<Icon.Card size={22}/>} label="Cobranças" redBadge={2}/>
      <Tab glyph={<Icon.Dots size={22}/>} label="Mais" blueDot={moreUnread}/>
    </div>
  );
}

// Small framed specimen of the desktop nav link in isolation (badge variants)
function NavLinkSpecimen({ badge, palette }) {
  const p = palette || window.PALETTE_LIGHT;
  const { NIcon } = window;
  return (
    <div style={{ width: 220, background: p.surface, border: `1px solid ${p.border}`, borderRadius: 8, padding: 8 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8,
        fontSize: 14, fontWeight: 600, background: 'rgba(86,143,179,0.18)', color: p.blue7,
      }}>
        <span style={{ display: 'flex', color: p.blue6 }}><NIcon.Bell size={18}/></span>
        <span style={{ flex: 1 }}>Notificações</span>
        {badge != null && (
          <span style={{ background: p.blue6, color: '#fff', fontSize: 10.5, fontWeight: 700, padding: '1px 6px', borderRadius: 999, minWidth: 16, textAlign: 'center' }}>{badge}</span>
        )}
      </div>
    </div>
  );
}

Object.assign(window, {
  IIcon, NOTIF_TYPES, INBOX, describeNotification, fmtBRL, ThemeIcon, NotificationRow, SkeletonRow,
  MarkAllReadBtn, LoadMoreBtn, EndIndicator, EmptyState, ErrorState,
  InboxContent, NotificationInboxDrawer, DesktopNav, DesktopInboxPage,
  MobileTabBar, NavLinkSpecimen,
});
