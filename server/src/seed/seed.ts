import mongoose, { type HydratedDocument } from 'mongoose';
import { env } from '../config/env.js';
import { connectDb, disconnectDb } from '../db/connect.js';
import { hashPassword } from '../modules/auth/auth.service.js';
import { User } from '../models/User.js';
import { Institute } from '../models/Institute.js';
import { Employer } from '../models/Employer.js';
import { RegistrationRequest } from '../models/RegistrationRequest.js';
import { Drive, type DriveDoc } from '../models/Drive.js';
import { Jobseeker, type JobseekerStage } from '../models/Jobseeker.js';
import { Slot } from '../models/Slot.js';
import { AuditLog } from '../models/AuditLog.js';
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
  ['Nexatech Labs', 'Product'], ['Aetherverse AI', 'ML platform'], ['Quantbridge', 'Fintech'],
  ['Helioserv', 'Cloud infra'], ['Meridian Core', 'Enterprise SaaS'], ['Brightwave', 'Consumer'],
  ['Corvexa', 'Cybersecurity'], ['Lumenar', 'Analytics'],
];

async function run() {
  await connectDb(env.MONGODB_URI);
  const rng = makeRng(20260712);
  const consentPick = () => { const r = rng(); return r < 0.85 ? 'Granted' : r < 0.95 ? 'Pending' : 'Revoked'; };

  await Promise.all([
    User.deleteMany({}), Institute.deleteMany({}), Employer.deleteMany({}),
    Drive.deleteMany({}), Jobseeker.deleteMany({}), Slot.deleteMany({}), AuditLog.deleteMany({}),
    RegistrationRequest.deleteMany({}),
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
  const employers = [];
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
      activeDrives: intBetween(rng, 0, 4),
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

  // Slots for the next MatchDay (Jul 15): 360 total => 288 booked, 36 held, 72 available.
  const md = drives[0];
  const slotDocs = [];
  const statusPlan: ('booked' | 'held' | 'available')[] = [
    ...Array(288).fill('booked'), ...Array(36).fill('held'), ...Array(72).fill('available'),
  ];
  for (let i = 0; i < statusPlan.length; i++) {
    slotDocs.push({
      driveId: md._id, employerId: statusPlan[i] === 'available' ? null : employers[i % 9]._id,
      date: upcomingDates[0], start: '10:00', end: '12:00', status: statusPlan[i], createdAt: spread(),
    });
  }
  await Slot.insertMany(slotDocs);

  // Audit logs for institutes
  const auditDocs = [];
  for (const inst of institutes) {
    auditDocs.push({ entityType: 'institute', entityId: inst._id, action: 'created', actor: 'Platform Admin', detail: `Created ${inst.name}`, at: inst.createdAt });
    if (inst.status === 'Active') auditDocs.push({ entityType: 'institute', entityId: inst._id, action: 'approved', actor: 'Platform Admin', detail: `Approved ${inst.name}`, at: new Date(inst.createdAt.getTime() + DAY) });
  }
  await AuditLog.insertMany(auditDocs);

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
