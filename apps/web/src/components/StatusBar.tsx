interface StatusBarProps {
  connection?: 'connected' | 'reconnecting' | 'disconnected';
  file?: string;
  snapshot?: string;
  model?: string;
}

export function StatusBar({
  connection = 'connected',
  file = 'twosum.go',
  snapshot = '@s17',
  model = 'sonnet-4.6',
}: StatusBarProps) {
  const indicatorColor =
    connection === 'connected'
      ? 'var(--color-success)'
      : connection === 'reconnecting'
        ? 'var(--color-warn)'
        : 'var(--color-danger)';

  return (
    <div
      style={{
        height: 26,
        borderTop: '1px solid var(--color-hairline)',
        padding: '0 36px',
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        fontFamily: 'var(--font-mono)',
        fontSize: 10.5,
        color: 'var(--color-dim)',
        letterSpacing: '0.06em',
      }}
    >
      <span style={{ color: indicatorColor }}>◐</span>
      <span>neovim</span>
      <span>{file}</span>
      <span>{snapshot}</span>
      <span style={{ color: 'var(--color-faint)' }}>·</span>
      <span>{model}</span>
    </div>
  );
}
