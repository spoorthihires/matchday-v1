import { useTheme } from './ThemeContext.js';

// `variant="svg"` matches the employer app's inline-SVG icon convention (EmployerShell);
// the default matches the admin/portal/auth screens' Tabler webfont icons ("ti ti-*").
export function ThemeToggle({ variant = 'font' }: { variant?: 'font' | 'svg' }) {
  const { theme, toggleTheme } = useTheme();
  const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button type="button" className="icon-btn" aria-label={label} title={label} onClick={toggleTheme}>
      {variant === 'svg' ? (
        theme === 'dark' ? (
          <svg className="ic" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2 12h2M20 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
          </svg>
        ) : (
          <svg className="ic" viewBox="0 0 24 24">
            <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
          </svg>
        )
      ) : (
        <i className={theme === 'dark' ? 'ti ti-sun' : 'ti ti-moon'} />
      )}
    </button>
  );
}
