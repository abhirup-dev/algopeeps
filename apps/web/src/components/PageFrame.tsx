interface PageFrameProps {
  children: React.ReactNode;
}

/**
 * Outer page frame — sets the bg, font, flex column. Every page renders
 * its own TopBar + StatusBar inside.
 */
export function PageFrame({ children }: PageFrameProps) {
  return (
    <div
      style={{
        width: '100%',
        minHeight: '100%',
        background: 'var(--color-bg)',
        color: 'var(--color-bone)',
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        flexDirection: 'column',
        fontFeatureSettings: '"tnum"',
      }}
    >
      {children}
    </div>
  );
}
