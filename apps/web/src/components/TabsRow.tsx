interface Tab {
  label: string;
  active?: boolean;
}

export function TabsRow({ tabs }: { tabs: Tab[] }) {
  return (
    <div
      style={{
        padding: '14px 36px 0',
        display: 'flex',
        gap: 22,
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
      }}
    >
      {tabs.map((t, i) => (
        <span
          key={i}
          style={{
            color: t.active ? 'var(--color-bone)' : 'var(--color-dim)',
            paddingBottom: 8,
            borderBottom: t.active ? '2px solid var(--color-bone)' : '2px solid transparent',
          }}
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}
