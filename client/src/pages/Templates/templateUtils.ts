import type { TemplateSections } from '../../types/templates.js';

// Mirrors matchday-admin-app_23.html baseSections (line 2781): a shallow merge — an override key
// replaces the whole sub-object. Used as the create-mode default in the editor.
export function baseSections(over: Partial<TemplateSections> = {}): TemplateSections {
  return {
    assessment: { mcq: true, coding: true, tara: true, assignments: false },
    weightage: { MCQ: 20, Coding: 35, TARA: 30, Assignment: 15 },
    matching: { Skills: 40, Experience: 25, 'Domain fit': 20, Location: 15, threshold: 70 },
    kanban: ['Applied', 'Screened', 'MCQ', 'Coding', 'TARA', 'Shortlisted', 'Interview', 'Offer', 'Joined'],
    notifications: [
      { name: 'Shortlisted', ch: ['Email', 'WhatsApp'] },
      { name: 'Interview scheduled', ch: ['Email', 'WhatsApp', 'Bell'] },
      { name: 'Offer sent', ch: ['Email', 'WhatsApp'] },
      { name: 'Rejected', ch: ['Email'] },
    ],
    privacy: {
      'Mask contact until shortlist': true, 'Hide salary from institutes': true,
      'Require GDPR consent': true, 'Watermark resumes': false,
    },
    ...over,
  };
}

// Mirrors the prototype's secCounts (line 2806).
export function secCounts(s: TemplateSections) {
  return {
    assess: Object.values(s.assessment).filter(Boolean).length,
    stages: s.kanban.length,
    notif: s.notifications.length,
    match: Object.keys(s.matching).filter((k) => k !== 'threshold').length,
    priv: Object.values(s.privacy).filter(Boolean).length,
  };
}

// Mirrors the prototype's tplIcons map (line 2780): [tabler-icon, color-class].
const TPL_ICONS: Record<string, [string, string]> = {
  'Data / Analytics': ['ti-chart-bar', 'i-indigo'],
  'Data Engineering': ['ti-database', 'i-teal'],
  'Machine Learning': ['ti-brain', 'i-violet'],
  GenAI: ['ti-sparkles', 'i-amber'],
  Business: ['ti-briefcase', 'i-green'],
};
export function domainIcon(domain: string): [string, string] {
  return TPL_ICONS[domain] ?? ['ti-template', 'i-indigo'];
}

// Long-form relative time for the card "Updated …" line. Distinct from Approvals' short-form
// relativeTime ("2d ago") — the prototype uses the long phrasing ("2 days ago", "2 weeks ago").
export function relativeUpdated(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Absolute date for version entries — UTC to match the seed's Date.UTC values → "Jul 10, 2026".
export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${MON[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
