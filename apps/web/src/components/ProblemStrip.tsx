interface ProblemStripProps {
  title: string;
  difficulty: string;
  tags: string;
}

export function ProblemStrip({ title, difficulty, tags }: ProblemStripProps) {
  return (
    <div
      style={{
        padding: '14px 36px',
        borderBottom: '1px solid var(--color-hairline)',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <span style={{ fontSize: 18, fontWeight: 500 }}>{title}</span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--color-ash)',
        }}
      >
        {difficulty}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--color-dim)',
        }}
      >
        {tags}
      </span>
      <BracketChip>? expand</BracketChip>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <BracketChip>[problem]</BracketChip>
        <BracketChip>[tests]</BracketChip>
        <BracketChip>[pause]</BracketChip>
      </span>
    </div>
  );
}

function BracketChip({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--color-ash)',
        padding: '2px 8px',
        border: '1px solid var(--color-hairline2)',
      }}
    >
      {children}
    </span>
  );
}
