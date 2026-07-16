import mongoose, { type HydratedDocument } from 'mongoose';
import { env } from '../config/env.js';
import { connectDb, disconnectDb } from '../db/connect.js';
import { hashPassword } from '../modules/auth/auth.service.js';
import { User } from '../models/User.js';
import { Institute } from '../models/Institute.js';
import { Employer, type EmployerDoc } from '../models/Employer.js';
import { RegistrationRequest } from '../models/RegistrationRequest.js';
import { Drive, type DriveDoc } from '../models/Drive.js';
import { Jobseeker, type JobseekerStage } from '../models/Jobseeker.js';
import { Slot } from '../models/Slot.js';
import { AuditLog } from '../models/AuditLog.js';
import { DriveTemplate } from '../models/DriveTemplate.js';
import { EvalConfig } from '../models/EvalConfig.js';
import { Stream } from '../models/Stream.js';
import { StreamRules } from '../models/StreamRules.js';
import { DriveAssignment } from '../models/DriveAssignment.js';
import { SR_DEFAULTS } from '../modules/streamRules/service.js';
import { intBetween, makeRng, pick } from './rng.js';

const NOW = new Date('2026-07-12T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

const FIRST = ['Aarav', 'Diya', 'Vihaan', 'Ananya', 'Aditya', 'Ishaan', 'Kavya', 'Rohan', 'Meera', 'Arjun', 'Sara', 'Kabir', 'Nisha', 'Dev', 'Riya', 'Yash'];
const LAST = ['Sharma', 'Reddy', 'Nair', 'Iyer', 'Patel', 'Gupta', 'Rao', 'Menon', 'Das', 'Khan', 'Joshi', 'Verma'];
const BRANCHES = ['CSE', 'IT', 'ECE', 'EEE', 'MECH'];
const SOURCES = ['Campus', 'Referral', 'Portal', 'Walk-in'];
const INSTITUTE_SEED = [
  ['VNR Vignana Jyothi', 'Hyderabad'], ['CBIT', 'Hyderabad'], ['VIT-AP', 'Amaravati'],
  ['GITAM', 'Visakhapatnam'], ['SRM University', 'Chennai'], ['BITS Pilani', 'Hyderabad'],
  ['Amrita', 'Coimbatore'], ['Manipal', 'Manipal'], ['PES University', 'Bengaluru'], ['MSRIT', 'Bengaluru'],
];
const EMPLOYER_SEED = [
  ['Nexatech Labs', 'Product · SaaS'], ['Aetherverse AI', 'ML / AI Platform'], ['Quantbridge', 'Fintech'],
  ['Helioserv', 'Cloud Infra'], ['Meridian Core', 'Enterprise'], ['Brightwave', 'E-commerce'],
  ['Corvexa', 'Enterprise'], ['Lumenar', 'Product · SaaS'],
];

async function run() {
  await connectDb(env.MONGODB_URI);
  const rng = makeRng(20260712);
  const consentPick = () => { const r = rng(); return r < 0.85 ? 'Granted' : r < 0.95 ? 'Pending' : 'Revoked'; };

  await Promise.all([
    User.deleteMany({}), Institute.deleteMany({}), Employer.deleteMany({}),
    Drive.deleteMany({}), Jobseeker.deleteMany({}), Slot.deleteMany({}), AuditLog.deleteMany({}),
    RegistrationRequest.deleteMany({}), DriveTemplate.deleteMany({}), EvalConfig.deleteMany({}),
    Stream.deleteMany({}), StreamRules.deleteMany({}), DriveAssignment.deleteMany({}),
  ]);

  const adminPassword = 'Password123!';
  await User.create({
    email: 'admin@matchday.dev', name: 'Platform Admin', role: 'admin',
    passwordHash: await hashPassword(adminPassword),
  });

  const spread = () => new Date(NOW.getTime() - intBetween(rng, 0, 60) * DAY);

  // 21 institutes (repeat the seed list, vary the names) — keep first 10 stable for the leaderboard.
  const INST_TYPES = ['Engineering College', 'University', 'Autonomous Institute', 'Bootcamp'];
  const institutes = [];
  for (let i = 0; i < 21; i++) {
    const base = INSTITUTE_SEED[i % INSTITUTE_SEED.length];
    const name = i < INSTITUTE_SEED.length ? base[0] : `${base[0]} Campus ${Math.floor(i / INSTITUTE_SEED.length) + 1}`;
    const owner = `${pick(rng, FIRST)} ${pick(rng, LAST)}`;
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 10) || 'inst';
    const email = `spoc@${slug}.edu`;
    const createdAt = spread();
    const status = i < 18 ? 'Active' : i < 20 ? 'Pending' : 'Disabled';
    institutes.push(await Institute.create({
      name, city: base[1], type: pick(rng, INST_TYPES), status, owner, email, createdAt,
      ownershipHistory: [{ owner, email, changedAt: createdAt, changedBy: 'Platform Admin' }],
    }));
  }

  // 48 employers; offersExtended descending-ish so the leaderboard is meaningful.
  const EMPLOYER_SIZES = ['1–50', '51–200', '201–1000', '1000+'];
  const employers: HydratedDocument<EmployerDoc>[] = [];
  for (let i = 0; i < 48; i++) {
    const base = EMPLOYER_SEED[i % EMPLOYER_SEED.length];
    const offers = Math.max(0, 20 - Math.floor(i / 2));
    const name = i < EMPLOYER_SEED.length ? base[0] : `${base[0]} ${i}`;
    const slug = name.toLowerCase().replace(/[^a-z]+/g, '').slice(0, 10) || 'emp';
    employers.push(await Employer.create({
      name,
      industry: base[1], status: i < 46 ? 'Active' : 'Pending',
      offersExtended: offers, slotsFillRate: intBetween(rng, 55, 96), createdAt: spread(),
      size: pick(rng, EMPLOYER_SIZES),
      spoc: `${pick(rng, FIRST)} ${pick(rng, LAST)}`,
      email: `talent@${slug}.com`,
      candidatesViewed: intBetween(rng, 40, 420),
      shortlistRate: intBetween(rng, 20, 60),
      offerRate: intBetween(rng, 8, 35),
      respHours: intBetween(rng, 4, 96),
    }));
  }

  // 12 active drives; 3 upcoming Wednesdays (Jul 15/22/29).
  const upcomingDates = [new Date('2026-07-15T04:30:00.000Z'), new Date('2026-07-22T04:30:00.000Z'), new Date('2026-07-29T04:30:00.000Z')];
  const drives: HydratedDocument<DriveDoc>[] = [];
  const driveNames = ['Frontend & Data cohort', 'Full-stack cohort', 'ML/AI specialist cohort'];
  for (let i = 0; i < 12; i++) {
    const upcoming = i < 3;
    drives.push(await Drive.create({
      name: upcoming ? driveNames[i] : `Drive ${i + 1}`,
      domain: pick(rng, ['Frontend', 'Backend', 'Full-stack', 'Data / ML', 'DevOps']),
      stream: pick(rng, ['B.Tech', 'M.Tech', 'MCA', 'MBA']),
      status: 'Active',
      candType: pick(rng, ['Freshers', 'Experienced', 'Both']),
      mode: pick(rng, ['Online', 'Onsite', 'Hybrid']),
      frequency: pick(rng, ['Weekly', 'Bi-weekly', 'Monthly', 'One-time']),
      eventDay: 'Wednesday',
      eventDates: upcoming ? [upcomingDates[i]] : [new Date(NOW.getTime() + intBetween(rng, 30, 90) * DAY)],
      candCap: intBetween(rng, 150, 500), empCap: intBetween(rng, 5, 9), slotCap: intBetween(rng, 180, 360),
      eligibility: {
        sources: ['Institutes'], branches: ['CSE', 'IT', 'ECE'], gradYears: [2025, 2026], expType: 'Freshers only',
      },
      evaluation: [
        { key: 'mcq', enabled: true, config: { questions: 30, durationMin: 30 } },
        { key: 'coding', enabled: true, config: { problems: 3, durationMin: 60 } },
        { key: 'tara', enabled: true, config: { durationMin: 20 } },
        { key: 'assignments', enabled: false, config: { deadlineDays: 3 } },
      ],
      visibility: { employerReg: 'Invite-only', instituteVis: 'Selected institutes', candidateAccess: 'Eligible only' },
      createdBy: 'Platform Admin',
      createdAt: spread(),
    }));
  }
  drives[0].set('eventDates', upcomingDates.slice(0, 2));
  await drives[0].save();

  // 4 employer registration requests (prototype data) — driveId/driveName point at real
  // seeded drives, matched by domain (each drive's `domain` is independently randomized,
  // so match on it rather than name) with a claim-set to guarantee 4 distinct drives.
  const usedDriveIds = new Set<string>();
  const claimDrive = (domain: string, fallbackIdx: number) => {
    const found = drives.find((d) => d.domain === domain && !usedDriveIds.has(String(d._id)));
    const chosen = found ?? drives.find((d) => !usedDriveIds.has(String(d._id))) ?? drives[fallbackIdx];
    usedDriveIds.add(String(chosen._id));
    return chosen;
  };
  const regDrives = {
    vaultline: claimDrive('Backend', 9), // Backend Engineer role → a Backend-domain drive
    northpeak: claimDrive('DevOps', 1), // SRE role → a DevOps-domain drive
    aetherverse: claimDrive('Data / ML', 2), // ML Engineer role → 'ML/AI specialist cohort'
    cartsy: claimDrive('Frontend', 0), // Frontend Engineer role → 'Frontend & Data cohort'
  };
  const hoursAgo = (n: number) => new Date(NOW.getTime() - n * 3600 * 1000);
  const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);
  const registrations = [
    {
      company: 'Vaultline Systems', industry: 'Fintech', role: 'Backend Engineer (Go)',
      driveId: regDrives.vaultline._id, driveName: regDrives.vaultline.name,
      openings: 6, ctcRange: '₹18–26 LPA', skills: ['Go', 'PostgreSQL', 'gRPC', 'Kubernetes', 'Redis'],
      slot: 'Wed, Jul 16 · 10:00–12:00',
      panel: [
        { name: 'A. Khanna', role: 'Engineering Manager' },
        { name: 'R. Das', role: 'Staff Engineer' },
        { name: 'P. Sinha', role: 'HR Partner' },
      ],
      jd: 'Backend engineers to build low-latency payment infrastructure.\nOwn Go microservices, PostgreSQL schemas, and gRPC service contracts.\n2–5 years building production backend systems.',
      submittedBy: 'D. Sharma', status: 'Pending review',
      createdAt: hoursAgo(2),
      activity: [{ action: 'Submitted for review', by: 'D. Sharma (Vaultline)', at: hoursAgo(2) }],
    },
    {
      company: 'Northpeak Cloud', industry: 'Cloud Infra', role: 'Site Reliability Engineer',
      driveId: regDrives.northpeak._id, driveName: regDrives.northpeak.name,
      openings: 4, ctcRange: '₹20–30 LPA', skills: ['AWS', 'Terraform', 'Prometheus', 'Python', 'Linux'],
      slot: 'Wed, Jul 23 · 10:00–12:00',
      panel: [
        { name: 'K. Menon', role: 'SRE Lead' },
        { name: 'S. Roy', role: 'Principal Engineer' },
      ],
      jd: 'Join our platform team to keep large-scale cloud systems reliable.\nOwn observability, incident response, and Terraform automation.\nImprove deployment pipelines and SLOs.',
      submittedBy: 'K. Menon', status: 'Pending review',
      createdAt: hoursAgo(5),
      activity: [{ action: 'Submitted for review', by: 'K. Menon (Northpeak)', at: hoursAgo(5) }],
    },
    {
      company: 'Aetherverse AI', industry: 'ML / AI Platform', role: 'ML Engineer — NLP',
      driveId: regDrives.aetherverse._id, driveName: regDrives.aetherverse.name,
      openings: 3, ctcRange: '₹24–34 LPA', skills: ['Python', 'PyTorch', 'Transformers', 'MLOps', 'SQL'],
      slot: 'Wed, Jul 16 · 14:00–16:00',
      panel: [
        { name: 'S. Banerjee', role: 'ML Director' },
        { name: 'N. Verma', role: 'Senior MLE' },
        { name: 'P. Sinha', role: 'HR Partner' },
      ],
      jd: 'Build and ship NLP models for our AI hiring copilot.\nFine-tune transformer models and own evaluation pipelines.\nPartner with product on model behaviour.',
      submittedBy: 'S. Banerjee', status: 'Changes requested',
      createdAt: daysAgo(1),
      activity: [
        { action: 'Submitted for review', by: 'S. Banerjee (Aetherverse)', at: daysAgo(1) },
        { action: 'Changes requested — clarify CTC band', by: 'Platform Admin', at: hoursAgo(6) },
      ],
    },
    {
      company: 'Cartsy Commerce', industry: 'E-commerce', role: 'Frontend Engineer',
      driveId: regDrives.cartsy._id, driveName: regDrives.cartsy.name,
      openings: 5, ctcRange: '₹14–20 LPA', skills: ['React', 'TypeScript', 'Redux', 'CSS', 'Testing'],
      slot: 'Sat, Jul 26 · 11:00–13:00',
      panel: [
        { name: 'N. Rao', role: 'Frontend Lead' },
        { name: 'A. Jain', role: 'Design Systems' },
      ],
      jd: 'Own customer-facing storefront experiences at scale.\nBuild reusable React component libraries and improve Core Web Vitals.\nCollaborate closely with design.',
      submittedBy: 'N. Rao', status: 'Approved',
      createdAt: daysAgo(2),
      activity: [
        { action: 'Submitted for review', by: 'N. Rao (Cartsy)', at: daysAgo(2) },
        { action: 'Approved', by: 'Platform Admin', at: daysAgo(1) },
      ],
    },
  ];
  for (const r of registrations) {
    await RegistrationRequest.create(r);
  }

  // 1284 jobseekers with a stage distribution that yields the target funnel numbers.
  // Targets: profiles ~968, evals complete ~742, match-ready ~531, shortlisted ~196, offers ~84, joined ~41, dropped ~ (rest of completed path).
  const stageBuckets: { stage: JobseekerStage; count: number; profile: boolean; evalStatus: 'na' | 'pending' | 'completed' }[] = [
    { stage: 'Joined', count: 41, profile: true, evalStatus: 'completed' },
    { stage: 'Offer', count: 84 - 41, profile: true, evalStatus: 'completed' },
    { stage: 'Shortlisted', count: 196 - 84, profile: true, evalStatus: 'completed' },
    { stage: 'MatchReady', count: 531 - 196, profile: true, evalStatus: 'completed' },
    { stage: 'Evaluated', count: 742 - 531, profile: true, evalStatus: 'completed' },
    { stage: 'Screened', count: 968 - 742, profile: true, evalStatus: 'pending' },
    { stage: 'Applied', count: 1284 - 968, profile: false, evalStatus: 'na' },
  ];
  const jobseekerDocs = [];
  for (const b of stageBuckets) {
    for (let i = 0; i < b.count; i++) {
      const inst = institutes[intBetween(rng, 0, institutes.length - 1)];
      jobseekerDocs.push({
        name: `${pick(rng, FIRST)} ${pick(rng, LAST)}`,
        instituteId: inst._id, branch: pick(rng, BRANCHES),
        gradYear: pick(rng, [2025, 2026, 2027]), cgpa: Math.round((6 + rng() * 4) * 10) / 10,
        source: pick(rng, SOURCES), profileCompleted: b.profile,
        evaluationStatus: b.evalStatus, stage: b.stage, createdAt: spread(),
        email: `${pick(rng, FIRST)}.${pick(rng, LAST)}${intBetween(rng, 1, 999)}@${(inst.name as string).toLowerCase().replace(/[^a-z]+/g, '').slice(0, 10) || 'inst'}.edu`.toLowerCase(),
        consent: consentPick(),
      });
    }
  }
  await Jobseeker.insertMany(jobseekerDocs);

  // Interview slot sessions across Jul 2026 (Wed & Sat). Option B sums: cap 360 / booked 288 / held 36.
  const SLOT_DAYS = [1, 4, 8, 11, 15, 18, 22, 25, 29];
  const WINDOWS: [string, string][] = [['10:00', '12:00'], ['14:00', '16:00'], ['16:30', '18:00']];
  type SeedSession = { day: number; start: string; end: string; capacity: number; booked: number; held: number };
  const sessions: SeedSession[] = [];
  for (const day of SLOT_DAYS) {
    const nWindows = day % 3 === 0 ? 3 : 2;
    for (let w = 0; w < nWindows; w++) {
      const [start, end] = WINDOWS[w];
      sessions.push({ day, start, end, capacity: intBetween(rng, 12, 20), booked: 0, held: 0 });
    }
  }
  // normalize capacities to exactly 360
  let capSum = sessions.reduce((a, s) => a + s.capacity, 0);
  for (let i = 0; capSum !== 360; i++) {
    const s = sessions[i % sessions.length];
    if (capSum > 360 && s.capacity > 8) { s.capacity--; capSum--; }
    else if (capSum < 360 && s.capacity < 50) { s.capacity++; capSum++; }
  }
  // booked ≈ 80% of capacity, adjusted to exactly 288
  for (const s of sessions) s.booked = Math.floor(s.capacity * 0.8);
  let bookedSum = sessions.reduce((a, s) => a + s.booked, 0);
  for (let i = 0; bookedSum !== 288; i++) {
    const s = sessions[i % sessions.length];
    if (bookedSum < 288 && s.booked < s.capacity) { s.booked++; bookedSum++; }
    else if (bookedSum > 288 && s.booked > 0) { s.booked--; bookedSum--; }
  }
  // held = 36, preferring future sessions with slack; fall back to any session with slack
  let heldSum = 0;
  const bySlackPref = [...sessions.filter((s) => s.day >= 15), ...sessions.filter((s) => s.day < 15)];
  for (let i = 0, guard = 0; heldSum < 36 && guard < 100000; i++, guard++) {
    const s = bySlackPref[i % bySlackPref.length];
    if (s.booked + s.held < s.capacity) { s.held++; heldSum++; }
  }
  if (capSum !== 360 || bookedSum !== 288 || heldSum !== 36) throw new Error(`slot seed sums off: cap=${capSum} booked=${bookedSum} held=${heldSum}`);
  const slotDocs = sessions.map((s, idx) => {
    const past = s.day < 15;
    const cancelled = idx === 5 || idx === 13;   // two deterministic cancellations
    const attended = past && !cancelled ? Math.max(0, s.booked - intBetween(rng, 0, 3)) : 0;
    return {
      driveId: (s.day === 15 ? drives[0] : drives[idx % 3])._id,
      employerId: employers[idx % 9]._id,
      date: new Date(Date.UTC(2026, 6, s.day)),
      start: s.start, end: s.end, capacity: s.capacity, booked: s.booked, held: s.held,
      status: cancelled ? 'Cancelled' : past ? 'Completed' : 'Scheduled',
      link: past ? '' : `https://meet.hiringhood.com/${Math.floor(rng() * 2176782336).toString(36)}`,
      attended, noShow: past && !cancelled ? s.booked - attended : 0,
      createdAt: spread(),
    };
  });
  await Slot.insertMany(slotDocs);

  // Audit logs for institutes
  const auditDocs = [];
  for (const inst of institutes) {
    auditDocs.push({ entityType: 'institute', entityId: inst._id, action: 'created', actor: 'Platform Admin', detail: `Created ${inst.name}`, at: inst.createdAt });
    if (inst.status === 'Active') auditDocs.push({ entityType: 'institute', entityId: inst._id, action: 'approved', actor: 'Platform Admin', detail: `Approved ${inst.name}`, at: new Date(inst.createdAt.getTime() + DAY) });
  }
  await AuditLog.insertMany(auditDocs);

  // ---- Drive templates (5, verbatim from the prototype's `templates` array) ----
  // baseSections mirrors the prototype's baseSections(over): a shallow merge, so an override key
  // replaces the whole sub-object (matches matchday-admin-app_23.html line 2781).
  const baseSections = (over: Record<string, unknown> = {}) => ({
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
  });
  // Note: `daysAgo` is already declared above (same NOW/DAY-based formula the brief specifies)
  // and is reused here as-is rather than redeclared, to avoid a duplicate block-scoped binding.
  const D = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));   // m is 0-based
  const templateDocs = [
    {
      name: 'Data Analyst', domain: 'Data / Analytics', status: 'Active', usedBy: 6,
      sections: baseSections({ weightage: { MCQ: 30, Coding: 25, TARA: 30, Assignment: 15 } }),
      version: '2.1', updatedAt: daysAgo(2), createdAt: D(2026, 4, 30),
      versions: [
        { v: '2.1', date: D(2026, 6, 10), by: 'Sharath P.', note: 'Raised MCQ weightage to 30%' },
        { v: '2.0', date: D(2026, 5, 22), by: 'Asha N.', note: 'Added assignment stage' },
        { v: '1.0', date: D(2026, 4, 30), by: 'Sharath P.', note: 'Initial template' },
      ],
    },
    {
      name: 'Data Engineer', domain: 'Data Engineering', status: 'Active', usedBy: 4,
      sections: baseSections({ assessment: { mcq: true, coding: true, tara: true, assignments: true } }),
      version: '1.4', updatedAt: daysAgo(5), createdAt: D(2026, 5, 1),
      versions: [
        { v: '1.4', date: D(2026, 6, 7), by: 'Sharath P.', note: 'Enabled take-home assignment' },
        { v: '1.0', date: D(2026, 5, 1), by: 'Sharath P.', note: 'Initial template' },
      ],
    },
    {
      name: 'ML Engineer', domain: 'Machine Learning', status: 'Active', usedBy: 5,
      sections: baseSections({ matching: { Skills: 45, Experience: 25, 'Domain fit': 20, Location: 10, threshold: 75 } }),
      version: '1.8', updatedAt: daysAgo(1), createdAt: D(2026, 4, 18),
      versions: [
        { v: '1.8', date: D(2026, 6, 11), by: 'Asha N.', note: 'Tightened matching threshold to 75%' },
        { v: '1.0', date: D(2026, 4, 18), by: 'Sharath P.', note: 'Initial template' },
      ],
    },
    {
      name: 'GenAI Engineer', domain: 'GenAI', status: 'Active', usedBy: 3,
      sections: baseSections({ weightage: { MCQ: 15, Coding: 30, TARA: 40, Assignment: 15 } }),
      version: '1.2', updatedAt: daysAgo(3), createdAt: D(2026, 5, 15),
      versions: [
        { v: '1.2', date: D(2026, 6, 9), by: 'Asha N.', note: 'Increased TARA weightage' },
        { v: '1.0', date: D(2026, 5, 15), by: 'Asha N.', note: 'Initial template' },
      ],
    },
    {
      name: 'Business Analyst', domain: 'Business', status: 'Inactive', usedBy: 0,
      sections: baseSections({
        assessment: { mcq: true, coding: false, tara: true, assignments: true },
        kanban: ['Applied', 'Screened', 'MCQ', 'TARA', 'Assignment', 'Shortlisted', 'Interview', 'Offer', 'Joined'],
      }),
      version: '1.0', updatedAt: daysAgo(14), createdAt: D(2026, 5, 28),
      versions: [
        { v: '1.0', date: D(2026, 5, 28), by: 'Sharath P.', note: 'Initial template' },
      ],
    },
  ];
  await DriveTemplate.insertMany(templateDocs);

  // ---- Evaluation configs (4, verbatim from the prototype's evConfigs array) ----
  const evalConfigDocs = [
    { name: 'Standard MCQ round', type: 'MCQ', enabled: true, passing: 60, attempts: 2, retake: 'After cooldown', cooldown: 2, validity: 90, autoQual: true, threshold: 70, contests: 8, updatedAt: daysAgo(2), createdAt: daysAgo(40) },
    { name: 'Coding challenge', type: 'Coding', enabled: true, passing: 65, attempts: 1, retake: 'Admin approval', cooldown: 3, validity: 120, autoQual: true, threshold: 75, contests: 6, updatedAt: daysAgo(5), createdAt: daysAgo(45) },
    { name: 'TARA AI interview', type: 'TARA', enabled: true, passing: 55, attempts: 1, retake: 'Not allowed', cooldown: 0, validity: 60, autoQual: false, threshold: 70, contests: 5, updatedAt: daysAgo(1), createdAt: daysAgo(30) },
    { name: 'Take-home assignment', type: 'Assignments', enabled: false, passing: 50, attempts: 2, retake: 'Unlimited', cooldown: 1, validity: 45, autoQual: false, threshold: 70, contests: 0, updatedAt: daysAgo(14), createdAt: daysAgo(20) },
  ];
  await EvalConfig.insertMany(evalConfigDocs);

  // ---- Streams (5, verbatim from the prototype's `streams` array) ----
  const streamDocs = [
    { name: 'Frontend Engineering', parent: 'Engineering', label: 'Frontend Developer', skills: ['React', 'TypeScript', 'CSS', 'HTML'], good: ['Next.js', 'Testing'], flow: ['MCQ', 'Coding', 'TARA'], cutoff: 65, cgpa: 6.5, backlogs: 1, grad: ['2025', '2026'], branches: ['CSE', 'IT'], sources: ['Institutes', 'Resume Vault'], status: 'Active', version: '1.3', updatedAt: daysAgo(2), createdAt: D(2026, 4, 30),
      versions: [ { v: '1.3', date: D(2026, 6, 10), by: 'Sharath P.', note: 'Added TypeScript to required skills' }, { v: '1.0', date: D(2026, 4, 30), by: 'Sharath P.', note: 'Initial stream' } ] },
    { name: 'Backend Engineering', parent: 'Engineering', label: 'Backend Developer', skills: ['Node.js', 'Databases', 'REST APIs'], good: ['Docker', 'Kubernetes'], flow: ['MCQ', 'Coding', 'TARA', 'Assignment'], cutoff: 70, cgpa: 6.5, backlogs: 1, grad: ['2025', '2026'], branches: ['CSE', 'IT'], sources: ['Institutes', 'Resume Vault', 'Referrals'], status: 'Active', version: '1.5', updatedAt: daysAgo(4), createdAt: D(2026, 5, 1),
      versions: [ { v: '1.5', date: D(2026, 6, 8), by: 'Asha N.', note: 'Raised cutoff to 70%' }, { v: '1.0', date: D(2026, 5, 1), by: 'Sharath P.', note: 'Initial stream' } ] },
    { name: 'Data / ML', parent: 'Data Science', label: 'ML Engineer', skills: ['Python', 'Machine Learning', 'Statistics'], good: ['PyTorch', 'MLOps'], flow: ['MCQ', 'Coding', 'TARA'], cutoff: 72, cgpa: 7.0, backlogs: 0, grad: ['2025', '2026'], branches: ['CSE', 'IT', 'ECE'], sources: ['Institutes'], status: 'Active', version: '2.0', updatedAt: daysAgo(1), createdAt: D(2026, 4, 18),
      versions: [ { v: '2.0', date: D(2026, 6, 11), by: 'Asha N.', note: 'Zero-backlog eligibility' }, { v: '1.0', date: D(2026, 4, 18), by: 'Sharath P.', note: 'Initial stream' } ] },
    { name: 'Full-stack', parent: 'Engineering', label: 'Full-stack Developer', skills: ['React', 'Node.js', 'Databases'], good: ['AWS', 'CI/CD'], flow: ['MCQ', 'Coding', 'TARA', 'Assignment'], cutoff: 68, cgpa: 6.5, backlogs: 1, grad: ['2025', '2026'], branches: ['CSE', 'IT'], sources: ['Institutes', 'Resume Vault'], status: 'Active', version: '1.1', updatedAt: daysAgo(6), createdAt: D(2026, 5, 10),
      versions: [ { v: '1.1', date: D(2026, 6, 5), by: 'Sharath P.', note: 'Added assignment stage' }, { v: '1.0', date: D(2026, 5, 10), by: 'Sharath P.', note: 'Initial stream' } ] },
    { name: 'Business Analytics', parent: 'Business', label: 'Business Analyst', skills: ['SQL', 'Excel', 'Storytelling'], good: ['Power BI', 'Python'], flow: ['MCQ', 'TARA', 'Assignment'], cutoff: 60, cgpa: 6.0, backlogs: 2, grad: ['2025', '2026'], branches: ['MBA', 'MCA'], sources: ['Institutes', 'Direct Apply'], status: 'Disabled', version: '1.0', updatedAt: daysAgo(14), createdAt: D(2026, 5, 28),
      versions: [ { v: '1.0', date: D(2026, 5, 28), by: 'Asha N.', note: 'Initial stream' } ] },
  ];
  await Stream.insertMany(streamDocs);
  await StreamRules.create({ ...SR_DEFAULTS });

  // ---- Institute↔Drive assignments (each institute gets ~2–5 drives, deterministic) ----
  const assignmentDocs = [];
  for (const inst of institutes) {
    const n = intBetween(rng, 2, 5);
    const pickedIds = new Set<string>();
    for (let k = 0; k < n; k++) pickedIds.add(String(pick(rng, drives)._id));
    for (const dId of pickedIds) assignmentDocs.push({ instituteId: inst._id, driveId: dId, createdAt: spread() });
  }
  await DriveAssignment.insertMany(assignmentDocs);

  // eslint-disable-next-line no-console
  console.log('Seed complete.');
  // eslint-disable-next-line no-console
  console.log(`Admin login →  email: admin@matchday.dev   password: ${adminPassword}`);
  await disconnectDb();
  await mongoose.connection.close();
}

run().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('seed failed', err);
  process.exit(1);
});
