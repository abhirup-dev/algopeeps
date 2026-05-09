import type { RouteKey } from '../lib/routes';
import { ROUTES } from '../lib/routes';

interface DevNavProps {
  current: RouteKey;
  onNavigate: (key: RouteKey) => void;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export function DevNav({ current, onNavigate, theme, onToggleTheme }: DevNavProps) {
  return (
    <nav
      style={{
        position: 'fixed',
        top: 12,
        right: 12,
        zIndex: 100,
        display: 'flex',
        gap: 6,
        padding: '6px 10px',
        background: 'var(--color-panel)',
        border: '1px solid var(--color-hairline2)',
        borderRadius: 2,
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        letterSpacing: '0.10em',
        textTransform: 'uppercase',
        boxShadow: '0 1px 0 var(--color-hairline)',
      }}
    >
      {ROUTES.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => onNavigate(r.key)}
          style={{
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            padding: '4px 6px',
            color: current === r.key ? 'var(--color-accent)' : 'var(--color-ash)',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            letterSpacing: 'inherit',
            textTransform: 'inherit',
          }}
          title={r.path}
        >
          {r.short}
        </button>
      ))}
      <span style={{ width: 1, background: 'var(--color-hairline)', alignSelf: 'stretch', margin: '0 4px' }} />
      <button
        type="button"
        onClick={onToggleTheme}
        title={`switch to ${theme === 'dark' ? 'light' : 'dark'}`}
        style={{
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '4px 6px',
          color: 'var(--color-bone)',
          fontFamily: 'inherit',
          fontSize: 'inherit',
        }}
      >
        {theme === 'dark' ? '◐' : '◑'}
      </button>
    </nav>
  );
}
