import { TabsRow } from './TabsRow';

interface Tab {
  label: string;
  active?: boolean;
}

interface TopBarProps {
  title: React.ReactNode;
  right?: React.ReactNode;
  tabs?: Tab[];
}

export function TopBar({ title, right, tabs }: TopBarProps) {
  return (
    <header>
      <div
        style={{
          padding: '20px 36px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--color-bone)',
          }}
        >
          {title}
        </span>
        {right && (
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.10em',
              color: 'var(--color-dim)',
            }}
          >
            {right}
          </span>
        )}
      </div>
      {tabs && <TabsRow tabs={tabs} />}
      <div
        style={{
          height: 1,
          background: 'var(--color-hairline)',
          margin: tabs ? '0' : '14px 36px 0',
        }}
      />
    </header>
  );
}
