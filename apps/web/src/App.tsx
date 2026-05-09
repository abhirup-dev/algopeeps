import { useCallback, useEffect, useState } from 'react';
import { ActivePage } from './pages/Active';
import { TodayPage } from './pages/Today';
import { ProblemPeekPage } from './pages/ProblemPeek';
import { ConsultorPage } from './pages/Consultor';
import { DrawPage } from './pages/Draw';
import { PostMortemPage } from './pages/PostMortem';
import { ProfilePage } from './pages/Profile';
import { AnalyticsPage } from './pages/Analytics';
import { TestDemoPage } from './pages/TestDemo';
import { DevNav } from './components/DevNav';
import type { FocusedSlot } from './lib/types';
import { type RouteKey, routeFromHash } from './lib/routes';

type Theme = 'dark' | 'light';

const THEME_KEY = 'algopeeps.theme';

export function App() {
  const [route, setRoute] = useState<RouteKey>(() => routeFromHash(window.location.hash));
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());
  const [focused, setFocused] = useState<FocusedSlot>(null);

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* ignore quota / private mode */
    }
  }, [theme]);

  const navigate = useCallback((key: RouteKey) => {
    window.location.hash = key;
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <>
      <DevNav current={route} onNavigate={navigate} theme={theme} onToggleTheme={toggleTheme} />
      <RoutedPage route={route} focused={focused} onFocusChange={setFocused} />
    </>
  );
}

function RoutedPage({
  route,
  focused,
  onFocusChange,
}: {
  route: RouteKey;
  focused: FocusedSlot;
  onFocusChange: (s: FocusedSlot) => void;
}) {
  switch (route) {
    case 'today':      return <TodayPage />;
    case 'active':     return <ActivePage focused={focused} onFocusChange={onFocusChange} />;
    case 'peek':       return <ProblemPeekPage />;
    case 'consultor':  return <ConsultorPage />;
    case 'draw':       return <DrawPage />;
    case 'postmortem': return <PostMortemPage />;
    case 'profile':    return <ProfilePage />;
    case 'analytics':  return <AnalyticsPage />;
    case 'testdemo':   return <TestDemoPage />;
  }
}

function readStoredTheme(): Theme {
  try {
    const v = window.localStorage.getItem(THEME_KEY);
    if (v === 'light' || v === 'dark') return v;
  } catch {
    /* ignore */
  }
  return 'dark';
}
