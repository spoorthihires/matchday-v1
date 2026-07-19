// Shared entry point for the employer portal area: importing this module pulls in the
// scoped employer stylesheet (client/src/styles/employer.css). Every employer screen
// imports this file (instead of importing the stylesheet directly) so the CSS is loaded
// exactly once and consistently, and so screens don't need to know the stylesheet's path.
//
// The stylesheet's selectors are all scoped under ".employer-app" (see employer.css's
// header comment), so it only takes effect on screens that render their markup inside a
// top-level <div className="employer-app">...</div>.
import '../../styles/employer.css';
