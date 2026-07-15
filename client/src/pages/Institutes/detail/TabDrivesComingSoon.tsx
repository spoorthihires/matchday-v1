// Institute↔drive assignment (the prototype's renderIdDrives(), lines ~3921-3924) isn't part of
// this build — there is no Drives detail page and no assignment API, so this tab renders a
// `.card` coming-soon notice rather than the prototype's drive-list table. This mirrors
// client/src/components/ComingSoon.tsx's message but stays a plain tabpane component (no
// self-wrapping <AppShell>, no :slug route param) since it's mounted inside InstituteDetail's
// existing single AppShell.

export function TabDrivesComingSoon() {
  return (
    <div className="card">
      <div className="card-h"><h3>Drives</h3></div>
      <p style={{ padding: '0 18px 20px', color: 'var(--muted)' }}>
        This tab is coming soon — institute↔drive assignment is not in this build yet.
      </p>
    </div>
  );
}
