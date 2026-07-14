# MatchDay Command Center — MERN Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the `matchday-admin-app_23.html` prototype into a real MERN app whose first slice is a JWT-gated Command Center dashboard driven by live MongoDB aggregation over six seeded collections.

**Architecture:** npm-workspaces monorepo. `server/` is Express + TypeScript + Mongoose exposing `POST /api/auth/login` and a protected `GET /api/dashboard/overview` that assembles one `DashboardOverview` payload via aggregation. `client/` is Vite + React + TypeScript + React Router + TanStack Query, reproducing the prototype's design by porting its CSS verbatim and binding each dashboard section to the API DTO.

**Tech Stack:** Node 20+, TypeScript 5, Express 4, Mongoose 8, bcryptjs, jsonwebtoken, zod; React 18, Vite 5, react-router-dom 6, @tanstack/react-query 5, @tabler/icons-webfont; Vitest + supertest + mongodb-memory-server (server) and Vitest + React Testing Library + jsdom (client).

## Global Constraints

- **Language:** TypeScript everywhere, `"strict": true`. No `.js` source files.
- **Node:** `>=20`. **Package manager:** npm with workspaces.
- **Spec is authoritative:** `docs/superpowers/specs/2026-07-14-matchday-command-center-design.md`. The `DashboardOverview` DTO in spec §5 is the source of truth for both client and server types.
- **DTO parity:** `server/src/types/dashboard.ts` and `client/src/types/dashboard.ts` must stay byte-identical (copy the file).
- **Error shape:** every server error response is `{ error: { message, code } }`.
- **Single source of truth per metric:** all candidate-funnel metrics derive from the `Jobseeker` collection only.
- **Determinism:** the seed script and aggregation service must not call `Math.random()` or bare `new Date()` in logic that tests assert on — the aggregation service takes an injectable `now`.
- **Ports:** server `4000`, client dev `5173`. Client talks to `/api` (Vite proxy in dev).
- **Fonts/icons:** Inter + JetBrains Mono (Google Fonts), Tabler Icons webfont `@tabler/icons-webfont@2.47.0`.
- **Commits:** one commit per task minimum, conventional-commit style (`feat:`, `test:`, `chore:`).

---

## File Structure

```
matchday/
  package.json                      # root: workspaces + dev/seed/test scripts
  .gitignore
  server/
    package.json
    tsconfig.json
    .env.example
    vitest.config.ts
    src/
      index.ts                      # bootstrap: connect db, start server
      app.ts                        # express app factory (testable, no listen)
      config/env.ts                 # zod-validated env
      config/dashboard.config.ts    # readiness weights + targets
      db/connect.ts
      middleware/asyncHandler.ts
      middleware/errorHandler.ts
      middleware/requireAuth.ts
      models/User.ts
      models/Institute.ts
      models/Employer.ts
      models/Drive.ts
      models/Jobseeker.ts
      models/Slot.ts
      modules/auth/auth.service.ts
      modules/auth/auth.controller.ts
      modules/auth/auth.routes.ts
      modules/dashboard/dashboard.service.ts
      modules/dashboard/dashboard.controller.ts
      modules/dashboard/dashboard.routes.ts
      types/dashboard.ts
      seed/seed.ts
      seed/rng.ts
    test/
      helpers/db.ts                 # mongodb-memory-server setup
      auth.test.ts
      dashboard.service.test.ts
      dashboard.route.test.ts
  client/
    package.json
    tsconfig.json
    vite.config.ts
    vitest.config.ts
    .env.example
    index.html
    src/
      main.tsx
      App.tsx
      api/client.ts
      auth/AuthContext.tsx
      auth/ProtectedRoute.tsx
      auth/LoginPage.tsx
      auth/MfaStub.tsx
      auth/ForgotStub.tsx
      hooks/useLogin.ts
      hooks/useDashboardOverview.ts
      components/AppShell.tsx
      components/Sidebar.tsx
      components/Topbar.tsx
      components/ComingSoon.tsx
      pages/Dashboard/index.tsx
      pages/Dashboard/ReadinessHero.tsx
      pages/Dashboard/KpiSection.tsx
      pages/Dashboard/FunnelsSection.tsx
      pages/Dashboard/ScheduleSection.tsx
      pages/Dashboard/LeaderboardsSection.tsx
      types/dashboard.ts
      styles/theme.css              # ported <style> from prototype
      test/LoginPage.test.tsx
      test/KpiSection.test.tsx
      test/setup.ts
```

---

## Task 1: Monorepo scaffolding

**Files:**
- Create: `package.json`, `.gitignore`, `server/.env.example`, `client/.env.example`

**Interfaces:**
- Produces: root scripts `dev`, `seed`, `test`; workspaces `server` and `client`.

- [ ] **Step 1: Create `.gitignore`**

```
node_modules/
dist/
build/
.env
*.log
.DS_Store
coverage/
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "matchday",
  "private": true,
  "version": "0.1.0",
  "workspaces": ["server", "client"],
  "scripts": {
    "dev": "concurrently -n server,client -c blue,green \"npm:dev -w server\" \"npm:dev -w client\"",
    "seed": "npm run seed -w server",
    "test": "npm run test -w server && npm run test -w client",
    "test:server": "npm run test -w server",
    "test:client": "npm run test -w client"
  },
  "devDependencies": {
    "concurrently": "^9.1.0"
  },
  "engines": { "node": ">=20" }
}
```

- [ ] **Step 3: Create `server/.env.example`**

```
PORT=4000
MONGODB_URI=mongodb://localhost:27017/matchday
JWT_SECRET=change-me-in-real-use-please
JWT_EXPIRES=1d
CLIENT_ORIGIN=http://localhost:5173
```

- [ ] **Step 4: Create `client/.env.example`**

```
VITE_API_URL=/api
```

- [ ] **Step 5: Install root dev deps and commit**

Run: `npm install`
Expected: `node_modules/` created, no errors (workspaces are empty until later tasks add their package.json — this is fine; if npm errors on missing workspace manifests, proceed to Task 2 first then `npm install`).

```bash
git init 2>/dev/null; git add -A
git commit -m "chore: scaffold monorepo workspaces"
```

---

## Task 2: Server foundation

**Files:**
- Create: `server/package.json`, `server/tsconfig.json`, `server/vitest.config.ts`, `server/src/config/env.ts`, `server/src/db/connect.ts`, `server/src/middleware/asyncHandler.ts`, `server/src/middleware/errorHandler.ts`, `server/src/app.ts`, `server/src/index.ts`
- Test: `server/test/helpers/db.ts`, `server/test/app.test.ts`

**Interfaces:**
- Produces:
  - `createApp(): Express` from `app.ts` — express app with json parser, cors, `/api/health` returning `{ ok: true }`, and `errorHandler` mounted last.
  - `env` object from `config/env.ts`: `{ PORT: number, MONGODB_URI: string, JWT_SECRET: string, JWT_EXPIRES: string, CLIENT_ORIGIN: string }`.
  - `connectDb(uri: string): Promise<void>` from `db/connect.ts`.
  - `asyncHandler(fn)` wrapper.
  - `class HttpError extends Error { status: number; code: string }` from `errorHandler.ts`, plus `errorHandler(err, req, res, next)`.
  - test helper `setupTestDb()` / `teardownTestDb()` from `test/helpers/db.ts`.

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "seed": "tsx src/seed/seed.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.21.1",
    "jsonwebtoken": "^9.0.2",
    "mongoose": "^8.8.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/node": "^20.17.6",
    "@types/supertest": "^6.0.2",
    "mongodb-memory-server": "^10.1.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
```

- [ ] **Step 4: Create `server/src/config/env.ts`**

```ts
import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/matchday'),
  JWT_SECRET: z.string().min(8).default('dev-secret-change-me'),
  JWT_EXPIRES: z.string().default('1d'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
```

- [ ] **Step 5: Create `server/src/middleware/asyncHandler.ts`**

```ts
import type { NextFunction, Request, Response } from 'express';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export const asyncHandler = (fn: Handler) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
```

- [ ] **Step 6: Create `server/src/middleware/errorHandler.ts`**

```ts
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: { message: 'Invalid request', code: 'validation' } });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { message: err.message, code: err.code } });
  }
  const message = err instanceof Error ? err.message : 'Unexpected error';
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: { message: 'Internal server error', code: 'internal' } });
}
```

- [ ] **Step 7: Create `server/src/db/connect.ts`**

```ts
import mongoose from 'mongoose';

export async function connectDb(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
```

- [ ] **Step 8: Create `server/src/app.ts`**

```ts
import cors from 'cors';
import express, { type Express } from 'express';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp(): Express {
  const app = express();
  app.use(cors({ origin: env.CLIENT_ORIGIN }));
  app.use(express.json());

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  // Route modules mounted in later tasks:
  // app.use('/api/auth', authRoutes);
  // app.use('/api/dashboard', dashboardRoutes);

  app.use(errorHandler);
  return app;
}
```

- [ ] **Step 9: Create `server/src/index.ts`**

```ts
import { createApp } from './app.js';
import { env } from './config/env.js';
import { connectDb } from './db/connect.js';

async function main() {
  await connectDb(env.MONGODB_URI);
  const app = createApp();
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`server listening on http://localhost:${env.PORT}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('fatal startup error', err);
  process.exit(1);
});
```

- [ ] **Step 10: Create test DB helper `server/test/helpers/db.ts`**

```ts
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongod: MongoMemoryServer | null = null;

export async function setupTestDb(): Promise<void> {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
}

export async function teardownTestDb(): Promise<void> {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
  mongod = null;
}

export async function clearDb(): Promise<void> {
  const { collections } = mongoose.connection;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
}
```

- [ ] **Step 11: Write the failing test `server/test/app.test.ts`**

```ts
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('app', () => {
  it('responds to health check', async () => {
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 12: Install and run the test**

Run: `npm install && npm run test -w server`
Expected: PASS (1 test).

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(server): express app foundation with health check and error handling"
```

---

## Task 3: Mongoose models

**Files:**
- Create: `server/src/models/User.ts`, `Institute.ts`, `Employer.ts`, `Drive.ts`, `Jobseeker.ts`, `Slot.ts`
- Test: `server/test/models.test.ts`

**Interfaces:**
- Produces (each is a Mongoose model with a TS interface exported):
  - `User` — `{ email: string; passwordHash: string; name: string; role: 'admin'; createdAt: Date }`
  - `Institute` — `{ name; city; type; status: 'Active'|'Pending'|'Disabled'; createdAt }`
  - `Employer` — `{ name; industry; status: 'Active'|'Pending'|'Disabled'; offersExtended: number; slotsFillRate: number; createdAt }`
  - `Drive` — `{ name; domain; stream; status: 'Active'|'Published'|'Draft'|'Archived'; eventDate: Date; candCap: number; empCap: number; slotCap: number; createdAt }`
  - `Jobseeker` — `{ name; instituteId: ObjectId; branch; gradYear: number; cgpa: number; source; profileCompleted: boolean; evaluationStatus: 'na'|'pending'|'completed'; stage: JobseekerStage; createdAt }`
  - `Slot` — `{ driveId: ObjectId; employerId: ObjectId | null; date: Date; start: string; end: string; status: 'booked'|'held'|'available'; createdAt }`
  - Exports the union type `JobseekerStage = 'Applied'|'Screened'|'Evaluated'|'MatchReady'|'Shortlisted'|'Offer'|'Joined'|'DroppedOff'`.

- [ ] **Step 1: Create `server/src/models/User.ts`**

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['admin'], default: 'admin' },
  createdAt: { type: Date, default: Date.now },
});

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model('User', userSchema);
```

- [ ] **Step 2: Create `server/src/models/Institute.ts`**

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

const instituteSchema = new Schema({
  name: { type: String, required: true },
  city: { type: String, required: true },
  type: { type: String, required: true },
  status: { type: String, enum: ['Active', 'Pending', 'Disabled'], default: 'Active' },
  createdAt: { type: Date, default: Date.now },
});

export type InstituteDoc = InferSchemaType<typeof instituteSchema>;
export const Institute = model('Institute', instituteSchema);
```

- [ ] **Step 3: Create `server/src/models/Employer.ts`**

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

const employerSchema = new Schema({
  name: { type: String, required: true },
  industry: { type: String, required: true },
  status: { type: String, enum: ['Active', 'Pending', 'Disabled'], default: 'Active' },
  offersExtended: { type: Number, default: 0 },
  slotsFillRate: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

export type EmployerDoc = InferSchemaType<typeof employerSchema>;
export const Employer = model('Employer', employerSchema);
```

- [ ] **Step 4: Create `server/src/models/Drive.ts`**

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

const driveSchema = new Schema({
  name: { type: String, required: true },
  domain: { type: String, required: true },
  stream: { type: String, required: true },
  status: { type: String, enum: ['Active', 'Published', 'Draft', 'Archived'], default: 'Draft' },
  eventDate: { type: Date, required: true },
  candCap: { type: Number, default: 0 },
  empCap: { type: Number, default: 0 },
  slotCap: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

export type DriveDoc = InferSchemaType<typeof driveSchema>;
export const Drive = model('Drive', driveSchema);
```

- [ ] **Step 5: Create `server/src/models/Jobseeker.ts`**

```ts
import { Schema, model, Types, type InferSchemaType } from 'mongoose';

export type JobseekerStage =
  | 'Applied' | 'Screened' | 'Evaluated' | 'MatchReady'
  | 'Shortlisted' | 'Offer' | 'Joined' | 'DroppedOff';

export const JOBSEEKER_STAGES: JobseekerStage[] = [
  'Applied', 'Screened', 'Evaluated', 'MatchReady',
  'Shortlisted', 'Offer', 'Joined', 'DroppedOff',
];

const jobseekerSchema = new Schema({
  name: { type: String, required: true },
  instituteId: { type: Schema.Types.ObjectId, ref: 'Institute', required: true },
  branch: { type: String, required: true },
  gradYear: { type: Number, required: true },
  cgpa: { type: Number, required: true },
  source: { type: String, required: true },
  profileCompleted: { type: Boolean, default: false },
  evaluationStatus: { type: String, enum: ['na', 'pending', 'completed'], default: 'na' },
  stage: { type: String, enum: JOBSEEKER_STAGES, default: 'Applied' },
  createdAt: { type: Date, default: Date.now },
});

export type JobseekerDoc = InferSchemaType<typeof jobseekerSchema>;
export const Jobseeker = model('Jobseeker', jobseekerSchema);
export { Types };
```

- [ ] **Step 6: Create `server/src/models/Slot.ts`**

```ts
import { Schema, model, type InferSchemaType } from 'mongoose';

const slotSchema = new Schema({
  driveId: { type: Schema.Types.ObjectId, ref: 'Drive', required: true },
  employerId: { type: Schema.Types.ObjectId, ref: 'Employer', default: null },
  date: { type: Date, required: true },
  start: { type: String, required: true },
  end: { type: String, required: true },
  status: { type: String, enum: ['booked', 'held', 'available'], default: 'available' },
  createdAt: { type: Date, default: Date.now },
});

export type SlotDoc = InferSchemaType<typeof slotSchema>;
export const Slot = model('Slot', slotSchema);
```

- [ ] **Step 7: Write the failing test `server/test/models.test.ts`**

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Institute } from '../src/models/Institute.js';
import { Jobseeker } from '../src/models/Jobseeker.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

describe('models', () => {
  it('persists an institute and a jobseeker referencing it', async () => {
    const inst = await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering' });
    const js = await Jobseeker.create({
      name: 'Aarav Sharma', instituteId: inst._id, branch: 'CSE',
      gradYear: 2026, cgpa: 8.4, source: 'Campus',
      profileCompleted: true, evaluationStatus: 'completed', stage: 'MatchReady',
    });
    expect(js.stage).toBe('MatchReady');
    expect(String(js.instituteId)).toBe(String(inst._id));
    expect(inst.status).toBe('Active');
  });

  it('rejects an invalid stage', async () => {
    const inst = await Institute.create({ name: 'X', city: 'Y', type: 'Z' });
    await expect(
      Jobseeker.create({ name: 'Bad', instituteId: inst._id, branch: 'CSE',
        gradYear: 2026, cgpa: 8, source: 'Campus', stage: 'Nonsense' as never }),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 8: Run the test**

Run: `npm run test -w server -- models`
Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(server): mongoose models for the six core collections"
```

---

## Task 4: Auth module (login + JWT + guard)

**Files:**
- Create: `server/src/modules/auth/auth.service.ts`, `auth.controller.ts`, `auth.routes.ts`, `server/src/middleware/requireAuth.ts`
- Modify: `server/src/app.ts` (mount `/api/auth`)
- Test: `server/test/auth.test.ts`

**Interfaces:**
- Consumes: `User` model, `HttpError`, `asyncHandler`, `env`.
- Produces:
  - `hashPassword(plain: string): Promise<string>`
  - `verifyPassword(plain: string, hash: string): Promise<boolean>`
  - `signToken(payload: { sub: string; role: string }): string`
  - `login(email: string, password: string): Promise<{ token: string; user: { id: string; name: string; email: string; role: string } }>` — throws `HttpError(401, 'Invalid credentials', 'auth')` on failure.
  - `requireAuth(req, res, next)` — validates `Authorization: Bearer`, sets `req.userId` and `req.userRole`; throws `HttpError(401, ...)` otherwise.
  - `authRoutes` express router with `POST /login`.

- [ ] **Step 1: Create `server/src/modules/auth/auth.service.ts`**

```ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { HttpError } from '../../middleware/errorHandler.js';
import { User } from '../../models/User.js';

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function signToken(payload: { sub: string; role: string }): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES });
}

export async function login(email: string, password: string) {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) throw new HttpError(401, 'Invalid credentials', 'auth');
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) throw new HttpError(401, 'Invalid credentials', 'auth');
  const token = signToken({ sub: String(user._id), role: user.role });
  return {
    token,
    user: { id: String(user._id), name: user.name, email: user.email, role: user.role },
  };
}
```

- [ ] **Step 2: Create `server/src/middleware/requireAuth.ts`**

```ts
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { HttpError } from './errorHandler.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request { userId?: string; userRole?: string; }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header('authorization') ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(new HttpError(401, 'Missing or invalid token', 'auth'));
  }
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as { sub: string; role: string };
    req.userId = payload.sub;
    req.userRole = payload.role;
    return next();
  } catch {
    return next(new HttpError(401, 'Missing or invalid token', 'auth'));
  }
}
```

- [ ] **Step 3: Create `server/src/modules/auth/auth.controller.ts`**

```ts
import type { Request, Response } from 'express';
import { z } from 'zod';
import { login } from './auth.service.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginController(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body);
  const result = await login(email, password);
  res.json(result);
}
```

- [ ] **Step 4: Create `server/src/modules/auth/auth.routes.ts`**

```ts
import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { loginController } from './auth.controller.js';

export const authRoutes = Router();
authRoutes.post('/login', asyncHandler(loginController));
```

- [ ] **Step 5: Mount auth routes in `server/src/app.ts`**

Replace the `// app.use('/api/auth', authRoutes);` comment and add the import at the top:

```ts
import { authRoutes } from './modules/auth/auth.routes.js';
```
```ts
  app.use('/api/auth', authRoutes);
```

- [ ] **Step 6: Write the failing test `server/test/auth.test.ts`**

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { User } from '../src/models/User.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(async () => {
  await clearDb();
  await User.create({
    email: 'admin@matchday.dev', name: 'Platform Admin', role: 'admin',
    passwordHash: await hashPassword('Password123!'),
  });
});

describe('POST /api/auth/login', () => {
  it('returns a token and user for valid credentials', async () => {
    const res = await request(createApp()).post('/api/auth/login')
      .send({ email: 'admin@matchday.dev', password: 'Password123!' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTypeOf('string');
    expect(res.body.user).toMatchObject({ email: 'admin@matchday.dev', role: 'admin' });
  });

  it('401s on wrong password', async () => {
    const res = await request(createApp()).post('/api/auth/login')
      .send({ email: 'admin@matchday.dev', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('auth');
  });

  it('400s on malformed body', async () => {
    const res = await request(createApp()).post('/api/auth/login')
      .send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('validation');
  });
});
```

- [ ] **Step 7: Run the test**

Run: `npm run test -w server -- auth`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(server): JWT login endpoint and requireAuth guard"
```

---

## Task 5: Dashboard DTO, config, and aggregation service

This is the core of the slice. The service reads the six collections and computes the entire `DashboardOverview`.

**Files:**
- Create: `server/src/types/dashboard.ts`, `server/src/config/dashboard.config.ts`, `server/src/modules/dashboard/dashboard.service.ts`
- Test: `server/test/dashboard.service.test.ts`

**Interfaces:**
- Consumes: all six models, `JOBSEEKER_STAGES`.
- Produces:
  - `types/dashboard.ts` — the exact `DashboardOverview` and `FunnelStep` interfaces from spec §5 (verbatim).
  - `config/dashboard.config.ts` — `{ weights: { supply: 0.30, demand: 0.25, slots: 0.20, evaluations: 0.25 }, supplyTarget: number, demandTarget: number }`.
  - `getOverview(now?: Date): Promise<DashboardOverview>` from `dashboard.service.ts`.

- [ ] **Step 1: Create `server/src/types/dashboard.ts`**

```ts
export interface FunnelStep {
  name: string;
  value: number;
  pct: number | null;
}

export interface DashboardOverview {
  readiness: {
    score: number;
    verdict: { label: string; tone: 'ontrack' | 'at-risk' | 'off-track' };
    nextMatchDay: string;
    countdown: { days: number; hours: number };
    pillars: { key: 'supply' | 'demand' | 'slots' | 'evaluations'; pct: number; caption: string }[];
    attention: { message: string } | null;
  };
  kpis: {
    key: string;
    label: string;
    group: string;
    value: number;
    display: string;
    delta: { value: number; direction: 'up' | 'down' | 'flat'; display: string };
  }[];
  funnels: {
    supply: FunnelStep[];
    demand: FunnelStep[];
    hiring: FunnelStep[];
  };
  schedule: {
    monthLabel: string;
    calendar: { day: number; inMonth: boolean; isWed: boolean; isToday: boolean; isNextMatchDay: boolean }[];
    events: {
      date: string;
      title: string;
      employers: number;
      slots: number;
      candidates: number;
      prepPct: number;
      status: 'prep' | 'open';
    }[];
  };
  slotUtilization: {
    booked: number;
    held: number;
    available: number;
    total: number;
    utilizedPct: number;
  };
  leaderboards: {
    institutes: { rank: number; name: string; city: string; ready: number; conversionPct: number }[];
    employers: { rank: number; name: string; industry: string; offers: number; fillRatePct: number }[];
  };
}
```

- [ ] **Step 2: Create `server/src/config/dashboard.config.ts`**

```ts
export const dashboardConfig = {
  weights: { supply: 0.30, demand: 0.25, slots: 0.20, evaluations: 0.25 },
  supplyTarget: 580,   // target match-ready candidates for the cycle
  demandTarget: 57,    // target active employers for the cycle
};

export function verdictFor(score: number): { label: string; tone: 'ontrack' | 'at-risk' | 'off-track' } {
  if (score >= 80) return { label: 'On track', tone: 'ontrack' };
  if (score >= 60) return { label: 'Needs a push', tone: 'at-risk' };
  return { label: 'Off track', tone: 'off-track' };
}
```

- [ ] **Step 3: Write the failing test `server/test/dashboard.service.test.ts`**

This test seeds a small, fully-known fixture and asserts computed values. Use a fixed `now`.

```ts
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';
import { Institute } from '../src/models/Institute.js';
import { Employer } from '../src/models/Employer.js';
import { Drive } from '../src/models/Drive.js';
import { Jobseeker } from '../src/models/Jobseeker.js';
import { Slot } from '../src/models/Slot.js';
import { getOverview } from '../src/modules/dashboard/dashboard.service.js';

const NOW = new Date('2026-07-12T10:00:00.000Z'); // a Sunday; next Wed is Jul 15

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

async function seedFixture() {
  const recent = new Date('2026-07-01T00:00:00.000Z'); // within 30d of NOW
  const old = new Date('2026-05-20T00:00:00.000Z');    // in prior 30d window

  const cbit = await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering', status: 'Active', createdAt: old });
  const vnr = await Institute.create({ name: 'VNR', city: 'Hyderabad', type: 'Engineering', status: 'Active', createdAt: recent });

  await Employer.create({ name: 'Nexatech', industry: 'Product', status: 'Active', offersExtended: 19, slotsFillRate: 95, createdAt: old });
  await Employer.create({ name: 'Aetherverse', industry: 'ML', status: 'Active', offersExtended: 14, slotsFillRate: 87, createdAt: recent });
  await Employer.create({ name: 'Pending Co', industry: 'SaaS', status: 'Pending', offersExtended: 0, slotsFillRate: 0, createdAt: recent });

  await Drive.create({ name: 'Frontend Cohort', domain: 'Web', stream: 'Frontend', status: 'Active', eventDate: new Date('2026-07-15T04:30:00.000Z'), candCap: 500, empCap: 9, slotCap: 360, createdAt: old });
  await Drive.create({ name: 'Fullstack Cohort', domain: 'Web', stream: 'Fullstack', status: 'Active', eventDate: new Date('2026-07-22T04:30:00.000Z'), candCap: 280, empCap: 7, slotCap: 280, createdAt: recent });
  await Drive.create({ name: 'Old Draft', domain: 'Data', stream: 'DE', status: 'Draft', eventDate: new Date('2026-06-01T04:30:00.000Z'), candCap: 100, empCap: 3, slotCap: 90, createdAt: old });

  // 10 jobseekers with known stages/flags. 6 created recent, 4 old.
  const mk = (over: Record<string, unknown>, createdAt: Date, inst = cbit._id) =>
    Jobseeker.create({ name: 'JS', instituteId: inst, branch: 'CSE', gradYear: 2026, cgpa: 8, source: 'Campus', ...over, createdAt });

  // CBIT: 3 match-ready, VNR: 1 match-ready
  await mk({ profileCompleted: true, evaluationStatus: 'completed', stage: 'MatchReady' }, recent, cbit._id);
  await mk({ profileCompleted: true, evaluationStatus: 'completed', stage: 'MatchReady' }, recent, cbit._id);
  await mk({ profileCompleted: true, evaluationStatus: 'completed', stage: 'Shortlisted' }, recent, cbit._id);
  await mk({ profileCompleted: true, evaluationStatus: 'completed', stage: 'MatchReady' }, recent, vnr._id);
  await mk({ profileCompleted: true, evaluationStatus: 'completed', stage: 'Offer' }, recent, cbit._id);
  await mk({ profileCompleted: true, evaluationStatus: 'completed', stage: 'Joined' }, recent, vnr._id);
  await mk({ profileCompleted: true, evaluationStatus: 'pending', stage: 'Evaluated' }, old, cbit._id);
  await mk({ profileCompleted: true, evaluationStatus: 'pending', stage: 'Screened' }, old, cbit._id);
  await mk({ profileCompleted: false, evaluationStatus: 'na', stage: 'Applied' }, old, vnr._id);
  await mk({ profileCompleted: false, evaluationStatus: 'na', stage: 'DroppedOff' }, old, vnr._id);

  const drive = await Drive.findOne({ name: 'Frontend Cohort' });
  const emp = await Employer.findOne({ name: 'Nexatech' });
  // slots for next matchday (Jul 15): 6 booked, 2 held, 2 available => total 10, util 60%
  for (let i = 0; i < 6; i++) await Slot.create({ driveId: drive!._id, employerId: emp!._id, date: new Date('2026-07-15T04:30:00.000Z'), start: '10:00', end: '12:00', status: 'booked' });
  for (let i = 0; i < 2; i++) await Slot.create({ driveId: drive!._id, employerId: emp!._id, date: new Date('2026-07-15T04:30:00.000Z'), start: '14:00', end: '16:00', status: 'held' });
  for (let i = 0; i < 2; i++) await Slot.create({ driveId: drive!._id, employerId: null, date: new Date('2026-07-15T04:30:00.000Z'), start: '16:30', end: '18:00', status: 'available' });
}

describe('getOverview', () => {
  it('computes KPI counts from the fixture', async () => {
    await seedFixture();
    const o = await getOverview(NOW);
    const kpi = (k: string) => o.kpis.find((x) => x.key === k)!;
    expect(kpi('activeDrives').value).toBe(2);
    expect(kpi('employerRegistrations').value).toBe(3);
    expect(kpi('instituteParticipation').value).toBe(2);
    expect(kpi('jobseekersAdded').value).toBe(10);
    expect(kpi('profilesCompleted').value).toBe(8);
    expect(kpi('evaluationsCompleted').value).toBe(6);
    expect(kpi('matchReady').value).toBe(3);   // stage === MatchReady only
    expect(kpi('shortlisted').value).toBe(1);
    expect(kpi('offersSent').value).toBe(1);
    expect(kpi('joined').value).toBe(1);
  });

  it('computes slot utilization', async () => {
    await seedFixture();
    const o = await getOverview(NOW);
    expect(o.slotUtilization).toMatchObject({ booked: 6, held: 2, available: 2, total: 10, utilizedPct: 60 });
  });

  it('computes readiness score and pillars', async () => {
    await seedFixture();
    const o = await getOverview(NOW);
    // supply pillar = matchReady(3)/target * 100 (small on tiny fixture), slots = 60, evals = completed6/(6+2)=75
    const slots = o.readiness.pillars.find((p) => p.key === 'slots')!;
    const evals = o.readiness.pillars.find((p) => p.key === 'evaluations')!;
    expect(slots.pct).toBe(60);
    expect(evals.pct).toBe(75);
    expect(o.readiness.score).toBeGreaterThanOrEqual(0);
    expect(o.readiness.score).toBeLessThanOrEqual(100);
    expect(['ontrack', 'at-risk', 'off-track']).toContain(o.readiness.verdict.tone);
  });

  it('builds the institute leaderboard ranked by match-ready', async () => {
    await seedFixture();
    const o = await getOverview(NOW);
    expect(o.leaderboards.institutes[0].name).toBe('CBIT');
    expect(o.leaderboards.institutes[0].ready).toBe(2);
    expect(o.leaderboards.institutes[0].rank).toBe(1);
  });

  it('builds the employer leaderboard ranked by offers', async () => {
    await seedFixture();
    const o = await getOverview(NOW);
    expect(o.leaderboards.employers[0].name).toBe('Nexatech');
    expect(o.leaderboards.employers[0].offers).toBe(19);
  });

  it('lists upcoming matchday events and picks the next matchday', async () => {
    await seedFixture();
    const o = await getOverview(NOW);
    expect(o.readiness.nextMatchDay.startsWith('2026-07-15')).toBe(true);
    expect(o.schedule.events.length).toBeGreaterThanOrEqual(1);
    expect(o.schedule.events[0].title).toContain('Frontend');
  });
});
```

- [ ] **Step 4: Run the test to confirm it fails**

Run: `npm run test -w server -- dashboard.service`
Expected: FAIL — `getOverview` not defined / module not found.

- [ ] **Step 5: Implement `server/src/modules/dashboard/dashboard.service.ts`**

```ts
import { Types } from 'mongoose';
import { dashboardConfig, verdictFor } from '../../config/dashboard.config.js';
import { Drive } from '../../models/Drive.js';
import { Employer } from '../../models/Employer.js';
import { Institute } from '../../models/Institute.js';
import { Jobseeker } from '../../models/Jobseeker.js';
import { Slot } from '../../models/Slot.js';
import type { DashboardOverview, FunnelStep } from '../../types/dashboard.js';

const DAY = 24 * 60 * 60 * 1000;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

function direction(delta: number): 'up' | 'down' | 'flat' {
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

function fmtDelta(delta: number, suffix = ''): { value: number; direction: 'up' | 'down' | 'flat'; display: string } {
  const dir = direction(delta);
  const sign = delta > 0 ? '+' : delta < 0 ? '−' : '';
  return { value: delta, direction: dir, display: dir === 'flat' ? 'no change' : `${sign}${Math.abs(delta)}${suffix}` };
}

/** count of docs created in [start, end) */
async function countInWindow(model: { countDocuments: (q: object) => Promise<number> }, start: Date, end: Date, extra: object = {}) {
  return model.countDocuments({ ...extra, createdAt: { $gte: start, $lt: end } });
}

function nextWednesday(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0 Sun .. 3 Wed
  let add = (3 - day + 7) % 7;
  if (add === 0) add = 0; // if today is Wednesday, treat today as next matchday
  d.setUTCDate(d.getUTCDate() + add);
  return d;
}

export async function getOverview(now: Date = new Date()): Promise<DashboardOverview> {
  const win1Start = new Date(now.getTime() - 30 * DAY);
  const win2Start = new Date(now.getTime() - 60 * DAY);

  // ---- Supply / hiring funnel counts from Jobseeker (single source) ----
  const [
    jsAdded, profilesCompleted, evalCompleted, evalPending,
    matchReady, shortlisted, offers, joined, droppedOff,
  ] = await Promise.all([
    Jobseeker.countDocuments({}),
    Jobseeker.countDocuments({ profileCompleted: true }),
    Jobseeker.countDocuments({ evaluationStatus: 'completed' }),
    Jobseeker.countDocuments({ evaluationStatus: 'pending' }),
    Jobseeker.countDocuments({ stage: 'MatchReady' }),
    Jobseeker.countDocuments({ stage: 'Shortlisted' }),
    Jobseeker.countDocuments({ stage: 'Offer' }),
    Jobseeker.countDocuments({ stage: 'Joined' }),
    Jobseeker.countDocuments({ stage: 'DroppedOff' }),
  ]);

  // ---- Drives ----
  const [activeDrives, upcomingWed] = await Promise.all([
    Drive.countDocuments({ status: 'Active' }),
    Drive.countDocuments({ status: 'Active', eventDate: { $gte: now } }),
  ]);

  // ---- Employers / Institutes ----
  const [employerRegistrations, instituteParticipation] = await Promise.all([
    Employer.countDocuments({}),
    Institute.countDocuments({ status: 'Active' }),
  ]);

  // ---- Slots ----
  const slotAgg = await Slot.aggregate<{ _id: string; n: number }>([
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  const slotBy = Object.fromEntries(slotAgg.map((s) => [s._id, s.n]));
  const booked = slotBy.booked ?? 0;
  const held = slotBy.held ?? 0;
  const available = slotBy.available ?? 0;
  const totalSlots = booked + held + available;

  // ---- 30-day deltas (count metrics) ----
  const [jsAddedPrev, employersPrev, institutesPrev] = await Promise.all([
    countInWindow(Jobseeker, win2Start, win1Start),
    countInWindow(Employer, win2Start, win1Start),
    countInWindow(Institute, win2Start, win1Start, { status: 'Active' }),
  ]);
  const [jsAddedRecent, employersRecent, institutesRecent] = await Promise.all([
    countInWindow(Jobseeker, win1Start, now),
    countInWindow(Employer, win1Start, now),
    countInWindow(Institute, win1Start, now, { status: 'Active' }),
  ]);

  // ---- Leaderboards ----
  const instLb = await Jobseeker.aggregate([
    { $match: { stage: { $in: ['MatchReady', 'Shortlisted', 'Offer', 'Joined'] } } },
    { $group: { _id: '$instituteId', ready: { $sum: { $cond: [{ $eq: ['$stage', 'MatchReady'] }, 1, 0] } }, total: { $sum: 1 } } },
    { $sort: { ready: -1 } },
    { $limit: 5 },
    { $lookup: { from: 'institutes', localField: '_id', foreignField: '_id', as: 'inst' } },
    { $unwind: '$inst' },
  ]);
  // conversion per institute = ready / (all jobseekers at that institute)
  const perInstituteTotals = await Jobseeker.aggregate<{ _id: Types.ObjectId; n: number }>([
    { $group: { _id: '$instituteId', n: { $sum: 1 } } },
  ]);
  const totalsMap = new Map(perInstituteTotals.map((x) => [String(x._id), x.n]));
  const institutesBoard = instLb.map((row, i) => ({
    rank: i + 1,
    name: row.inst.name as string,
    city: row.inst.city as string,
    ready: row.ready as number,
    conversionPct: pct(row.ready as number, totalsMap.get(String(row._id)) ?? row.ready),
  }));

  const empDocs = await Employer.find({ status: 'Active' }).sort({ offersExtended: -1 }).limit(5).lean();
  const employersBoard = empDocs.map((e, i) => ({
    rank: i + 1,
    name: e.name as string,
    industry: e.industry as string,
    offers: (e.offersExtended as number) ?? 0,
    fillRatePct: Math.round((e.slotsFillRate as number) ?? 0),
  }));

  // ---- Funnels ----
  const supply: FunnelStep[] = [
    { name: 'Jobseekers Added', value: jsAdded, pct: null },
    { name: 'Profiles Completed', value: profilesCompleted, pct: pct(profilesCompleted, jsAdded) },
    { name: 'Evaluations Completed', value: evalCompleted, pct: pct(evalCompleted, profilesCompleted) },
    { name: 'Match-Ready', value: matchReady, pct: pct(matchReady, evalCompleted) },
  ];
  const slotsOpened = totalSlots;
  const demand: FunnelStep[] = [
    { name: 'Employers Registered', value: employerRegistrations, pct: null },
    { name: 'Active Drives Created', value: activeDrives, pct: pct(activeDrives, employerRegistrations) },
    { name: 'Slots Opened', value: slotsOpened, pct: null },
    { name: 'Slots Booked', value: booked, pct: pct(booked, slotsOpened) },
  ];
  const hiring: FunnelStep[] = [
    { name: 'Match-Ready', value: matchReady, pct: null },
    { name: 'Shortlisted', value: shortlisted, pct: pct(shortlisted, matchReady) },
    { name: 'Offers Sent', value: offers, pct: pct(offers, shortlisted) },
    { name: 'Joined', value: joined, pct: pct(joined, offers) },
  ];

  // ---- Readiness pillars ----
  const supplyPct = Math.min(100, pct(matchReady, dashboardConfig.supplyTarget));
  const demandPct = Math.min(100, pct(employerRegistrations, dashboardConfig.demandTarget));
  const slotsPct = pct(booked, totalSlots);
  const evalPct = pct(evalCompleted, evalCompleted + evalPending);
  const { weights } = dashboardConfig;
  const score = Math.round(
    weights.supply * supplyPct + weights.demand * demandPct +
    weights.slots * slotsPct + weights.evaluations * evalPct,
  );
  const pillars = [
    { key: 'supply' as const, pct: supplyPct, caption: `${matchReady} match-ready` },
    { key: 'demand' as const, pct: demandPct, caption: `${employerRegistrations} employers live` },
    { key: 'slots' as const, pct: slotsPct, caption: `${booked} of ${totalSlots} booked` },
    { key: 'evaluations' as const, pct: evalPct, caption: `${evalPending} pending` },
  ];
  const attention = evalPending > 0 ? { message: `${evalPending} evaluations pending — clear these to lift readiness.` } : null;

  // ---- Schedule ----
  const nextMd = nextWednesday(now);
  const eventDocs = await Drive.find({ status: 'Active', eventDate: { $gte: new Date(now.getTime() - DAY) } })
    .sort({ eventDate: 1 }).limit(3).lean();
  const events = await Promise.all(eventDocs.map(async (d) => {
    const [slotCount, candCount] = await Promise.all([
      Slot.countDocuments({ driveId: d._id }),
      Jobseeker.countDocuments({}), // slice-level approximation; real per-drive linkage is a later slice
    ]);
    const bookedForDrive = await Slot.countDocuments({ driveId: d._id, status: 'booked' });
    return {
      date: new Date(d.eventDate as Date).toISOString(),
      title: `MatchDay · ${d.name}`,
      employers: (d.empCap as number) ?? 0,
      slots: slotCount,
      candidates: candCount,
      prepPct: pct(bookedForDrive, slotCount),
      status: (new Date(d.eventDate as Date).getTime() === nextMd.getTime() ? 'prep' : 'open') as 'prep' | 'open',
    };
  }));

  // calendar grid for the month of nextMd
  const year = nextMd.getUTCFullYear();
  const month = nextMd.getUTCMonth();
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const startDow = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const todayNum = now.getUTCMonth() === month && now.getUTCFullYear() === year ? now.getUTCDate() : -1;
  const calendar: DashboardOverview['schedule']['calendar'] = [];
  for (let i = 0; i < startDow; i++) calendar.push({ day: 0, inMonth: false, isWed: false, isToday: false, isNextMatchDay: false });
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = new Date(Date.UTC(year, month, day)).getUTCDay();
    calendar.push({
      day, inMonth: true, isWed: dow === 3, isToday: day === todayNum,
      isNextMatchDay: day === nextMd.getUTCDate(),
    });
  }

  // ---- KPIs ----
  const dropOffRate = jsAdded > 0 ? Math.round((droppedOff / jsAdded) * 1000) / 10 : 0;
  const kpis: DashboardOverview['kpis'] = [
    { key: 'activeDrives', label: 'Active Drives', group: 'Demand', value: activeDrives, display: String(activeDrives), delta: fmtDelta(0) },
    { key: 'upcomingWednesdays', label: 'Upcoming Wednesdays', group: 'Schedule', value: upcomingWed, display: String(upcomingWed), delta: { value: 0, direction: 'flat', display: 'scheduled' } },
    { key: 'employerRegistrations', label: 'Employer Registrations', group: 'Demand', value: employerRegistrations, display: String(employerRegistrations), delta: fmtDelta(employersRecent - employersPrev) },
    { key: 'instituteParticipation', label: 'Institute Participation', group: 'Supply', value: instituteParticipation, display: String(instituteParticipation), delta: fmtDelta(institutesRecent - institutesPrev) },
    { key: 'jobseekersAdded', label: 'Jobseekers Added', group: 'Supply', value: jsAdded, display: jsAdded.toLocaleString('en-US'), delta: fmtDelta(jsAddedRecent - jsAddedPrev) },
    { key: 'profilesCompleted', label: 'Profiles Completed', group: 'Supply', value: profilesCompleted, display: `${profilesCompleted.toLocaleString('en-US')} / ${jsAdded.toLocaleString('en-US')}`, delta: fmtDelta(pct(profilesCompleted, jsAdded), '%') },
    { key: 'evaluationsCompleted', label: 'Evaluations Completed', group: 'Supply', value: evalCompleted, display: String(evalCompleted), delta: fmtDelta(0) },
    { key: 'matchReady', label: 'Match-Ready Candidates', group: 'Supply', value: matchReady, display: String(matchReady), delta: fmtDelta(0) },
    { key: 'slotsBooked', label: 'Slots Booked', group: 'Slots', value: booked, display: `${booked} / ${totalSlots}`, delta: fmtDelta(pct(booked, totalSlots), '%') },
    { key: 'slotsAvailable', label: 'Slots Available', group: 'Slots', value: available, display: String(available), delta: fmtDelta(0) },
    { key: 'shortlisted', label: 'Shortlisted', group: 'Outcomes', value: shortlisted, display: String(shortlisted), delta: fmtDelta(0) },
    { key: 'offersSent', label: 'Offers Sent', group: 'Outcomes', value: offers, display: String(offers), delta: fmtDelta(0) },
    { key: 'joined', label: 'Joined Candidates', group: 'Outcomes', value: joined, display: String(joined), delta: fmtDelta(0) },
    { key: 'dropOffRate', label: 'Drop-off Rate', group: 'Outcomes', value: dropOffRate, display: `${dropOffRate}%`, delta: fmtDelta(0) },
  ];

  const daysToMd = Math.max(0, Math.ceil((nextMd.getTime() - now.getTime()) / DAY));

  return {
    readiness: {
      score,
      verdict: verdictFor(score),
      nextMatchDay: nextMd.toISOString(),
      countdown: { days: daysToMd, hours: 0 },
      pillars,
      attention,
    },
    kpis,
    funnels: { supply, demand, hiring },
    schedule: { monthLabel: `${MONTH_NAMES[month]} ${year}`, calendar, events },
    slotUtilization: { booked, held, available, total: totalSlots, utilizedPct: pct(booked, totalSlots) },
    leaderboards: { institutes: institutesBoard, employers: employersBoard },
  };
}
```

- [ ] **Step 6: Run the test to confirm it passes**

Run: `npm run test -w server -- dashboard.service`
Expected: PASS (6 tests). If a count is off, fix the pipeline — do not change the assertions unless the fixture math is wrong.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(server): dashboard aggregation service computing the full overview"
```

---

## Task 6: Dashboard route (protected)

**Files:**
- Create: `server/src/modules/dashboard/dashboard.controller.ts`, `dashboard.routes.ts`
- Modify: `server/src/app.ts` (mount `/api/dashboard`)
- Test: `server/test/dashboard.route.test.ts`

**Interfaces:**
- Consumes: `getOverview`, `requireAuth`, `asyncHandler`.
- Produces: `dashboardRoutes` router with protected `GET /overview`.

- [ ] **Step 1: Create `server/src/modules/dashboard/dashboard.controller.ts`**

```ts
import type { Request, Response } from 'express';
import { getOverview } from './dashboard.service.js';

export async function overviewController(_req: Request, res: Response) {
  const overview = await getOverview();
  res.json(overview);
}
```

- [ ] **Step 2: Create `server/src/modules/dashboard/dashboard.routes.ts`**

```ts
import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { requireAuth } from '../../middleware/requireAuth.js';
import { overviewController } from './dashboard.controller.js';

export const dashboardRoutes = Router();
dashboardRoutes.get('/overview', requireAuth, asyncHandler(overviewController));
```

- [ ] **Step 3: Mount in `server/src/app.ts`**

Add import and mount:

```ts
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
```
```ts
  app.use('/api/dashboard', dashboardRoutes);
```

- [ ] **Step 4: Write the failing test `server/test/dashboard.route.test.ts`**

```ts
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { signToken } from '../src/modules/auth/auth.service.js';
import { Institute } from '../src/models/Institute.js';
import { clearDb, setupTestDb, teardownTestDb } from './helpers/db.js';

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearDb);

describe('GET /api/dashboard/overview', () => {
  it('401s without a token', async () => {
    const res = await request(createApp()).get('/api/dashboard/overview');
    expect(res.status).toBe(401);
  });

  it('200s with a valid token and returns the DTO shape', async () => {
    await Institute.create({ name: 'CBIT', city: 'Hyderabad', type: 'Engineering' });
    const token = signToken({ sub: 'u1', role: 'admin' });
    const res = await request(createApp())
      .get('/api/dashboard/overview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('readiness.score');
    expect(Array.isArray(res.body.kpis)).toBe(true);
    expect(res.body).toHaveProperty('funnels.supply');
    expect(res.body).toHaveProperty('slotUtilization.total');
    expect(res.body).toHaveProperty('leaderboards.institutes');
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npm run test -w server -- dashboard.route`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(server): protected dashboard overview endpoint"
```

---

## Task 7: Seed script

**Files:**
- Create: `server/src/seed/rng.ts`, `server/src/seed/seed.ts`

**Interfaces:**
- Consumes: all models, `hashPassword`, `connectDb`, `env`.
- Produces: `npm run seed` populates the DB deterministically and prints the admin login.

- [ ] **Step 1: Create `server/src/seed/rng.ts`**

```ts
// Deterministic PRNG (mulberry32) — no Math.random, so seeds are reproducible.
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T>(rng: () => number, arr: T[]): T => arr[Math.floor(rng() * arr.length)];
export const intBetween = (rng: () => number, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));
```

- [ ] **Step 2: Create `server/src/seed/seed.ts`**

```ts
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { connectDb, disconnectDb } from '../db/connect.js';
import { hashPassword } from '../modules/auth/auth.service.js';
import { User } from '../models/User.js';
import { Institute } from '../models/Institute.js';
import { Employer } from '../models/Employer.js';
import { Drive } from '../models/Drive.js';
import { Jobseeker, type JobseekerStage } from '../models/Jobseeker.js';
import { Slot } from '../models/Slot.js';
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

  await Promise.all([
    User.deleteMany({}), Institute.deleteMany({}), Employer.deleteMany({}),
    Drive.deleteMany({}), Jobseeker.deleteMany({}), Slot.deleteMany({}),
  ]);

  const adminPassword = 'Password123!';
  await User.create({
    email: 'admin@matchday.dev', name: 'Platform Admin', role: 'admin',
    passwordHash: await hashPassword(adminPassword),
  });

  const spread = () => new Date(NOW.getTime() - intBetween(rng, 0, 60) * DAY);

  // 21 institutes (repeat the seed list, vary the names) — keep first 10 stable for the leaderboard.
  const institutes = [];
  for (let i = 0; i < 21; i++) {
    const base = INSTITUTE_SEED[i % INSTITUTE_SEED.length];
    const name = i < INSTITUTE_SEED.length ? base[0] : `${base[0]} Campus ${Math.floor(i / INSTITUTE_SEED.length) + 1}`;
    institutes.push(await Institute.create({ name, city: base[1], type: 'Engineering', status: 'Active', createdAt: spread() }));
  }

  // 48 employers; offersExtended descending-ish so the leaderboard is meaningful.
  const employers = [];
  for (let i = 0; i < 48; i++) {
    const base = EMPLOYER_SEED[i % EMPLOYER_SEED.length];
    const offers = Math.max(0, 20 - Math.floor(i / 2));
    employers.push(await Employer.create({
      name: i < EMPLOYER_SEED.length ? base[0] : `${base[0]} ${i}`,
      industry: base[1], status: i < 46 ? 'Active' : 'Pending',
      offersExtended: offers, slotsFillRate: intBetween(rng, 55, 96), createdAt: spread(),
    }));
  }

  // 12 active drives; 3 upcoming Wednesdays (Jul 15/22/29).
  const upcomingDates = [new Date('2026-07-15T04:30:00.000Z'), new Date('2026-07-22T04:30:00.000Z'), new Date('2026-07-29T04:30:00.000Z')];
  const drives = [];
  const driveNames = ['Frontend & Data cohort', 'Full-stack cohort', 'ML/AI specialist cohort'];
  for (let i = 0; i < 12; i++) {
    const upcoming = i < 3;
    drives.push(await Drive.create({
      name: upcoming ? driveNames[i] : `Drive ${i + 1}`,
      domain: pick(rng, ['Web', 'Data', 'ML', 'Cloud']),
      stream: pick(rng, ['Frontend', 'Backend', 'DE', 'MLE']),
      status: 'Active',
      eventDate: upcoming ? upcomingDates[i] : new Date(NOW.getTime() + intBetween(rng, 30, 90) * DAY),
      candCap: intBetween(rng, 150, 500), empCap: intBetween(rng, 5, 9), slotCap: intBetween(rng, 180, 360),
      createdAt: spread(),
    }));
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
```

- [ ] **Step 3: Run the seed against local mongod**

Run (ensure `mongod` is running): `cp server/.env.example server/.env && npm run seed`
Expected: prints `Seed complete.` and the admin login line. If mongod isn't running you'll get a connection error — start it first.

- [ ] **Step 4: Verify counts (optional sanity check)**

Run: `npm run test -w server` (all server tests still pass — seed doesn't affect the in-memory test DB).
Expected: all suites PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(server): deterministic seed for all six collections"
```

---

## Task 8: Client scaffolding + CSS/font port

**Files:**
- Create: `client/package.json`, `client/tsconfig.json`, `client/vite.config.ts`, `client/vitest.config.ts`, `client/.env.example`, `client/index.html`, `client/src/main.tsx`, `client/src/App.tsx`, `client/src/styles/theme.css`, `client/src/test/setup.ts`

**Interfaces:**
- Produces: a running Vite app at `:5173` with the prototype's CSS/fonts loaded and React Router + a QueryClient provider mounted. `App.tsx` renders a placeholder that Task 9 replaces with routes.

- [ ] **Step 1: Create `client/package.json`**

```json
{
  "name": "client",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@tabler/icons-webfont": "2.47.0",
    "@tanstack/react-query": "^5.59.16",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.28.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.0.1",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "jsdom": "^25.0.1",
    "typescript": "^5.6.3",
    "vite": "^5.4.10",
    "vitest": "^2.1.5"
  }
}
```

- [ ] **Step 2: Create `client/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `client/vite.config.ts`**

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
});
```

- [ ] **Step 4: Create `client/vitest.config.ts`**

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.tsx'],
  },
});
```

- [ ] **Step 5: Create `client/src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 6: Create `client/.env.example`**

```
VITE_API_URL=/api
```

- [ ] **Step 7: Create `client/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet" />
    <title>Hiringhood MatchDay Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create `client/src/styles/theme.css` by porting the prototype**

Open `matchday-admin-app_23.html`, copy the **entire contents of the `<style>` block** (from the opening `<style>` after the `<head>` to its closing `</style>`, roughly lines 12–980) into this file **verbatim**. Then add the Tabler icon font import at the very top of the file:

```css
@import '@tabler/icons-webfont/dist/tabler-icons.min.css';
/* ---- below: the prototype <style> block, pasted verbatim ---- */
```

Do not rewrite or "clean up" the CSS — a verbatim paste is what preserves the design. Remove only the `#auth-screen { display:none }`-style toggles that the prototype used for its JS view-switching if they conflict with React routing (leave a note in the commit if so).

- [ ] **Step 9: Create `client/src/App.tsx` (placeholder, replaced in Task 9)**

```tsx
export default function App() {
  return <div className="app-loading">MatchDay Admin — bootstrapping…</div>;
}
```

- [ ] **Step 10: Create `client/src/main.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import './styles/theme.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 11: Install and run the dev server briefly**

Run: `npm install && npm run dev -w client`
Expected: Vite serves at `http://localhost:5173`; the page shows the bootstrapping text with fonts loaded (no console errors). Stop the server after confirming.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(client): vite + react scaffolding with prototype CSS and fonts ported"
```

---

## Task 9: Auth UI (context, login, protected route, stubs)

**Files:**
- Create: `client/src/types/dashboard.ts`, `client/src/api/client.ts`, `client/src/auth/AuthContext.tsx`, `client/src/hooks/useLogin.ts`, `client/src/auth/LoginPage.tsx`, `client/src/auth/ProtectedRoute.tsx`, `client/src/auth/MfaStub.tsx`, `client/src/auth/ForgotStub.tsx`
- Modify: `client/src/App.tsx` (add routes)
- Test: `client/src/test/LoginPage.test.tsx`

**Interfaces:**
- Consumes: prototype auth markup (`matchday-admin-app_23.html` lines ~1011–1090 for the login/mfa/forgot views).
- Produces:
  - `client/src/types/dashboard.ts` — **byte-identical copy** of `server/src/types/dashboard.ts`.
  - `apiFetch<T>(path: string, opts?: { method?; body?; token?: string }): Promise<T>` from `api/client.ts`; throws `ApiError { status; message; code }` on non-2xx; on `401` it calls the registered `onUnauthorized` handler.
  - `AuthProvider` + `useAuth(): { user; token; login(email,password); logout() }`.
  - `useLogin()` mutation.
  - `LoginPage`, `ProtectedRoute`, `MfaStub`, `ForgotStub` components.

- [ ] **Step 1: Copy the DTO to the client**

Run: `cp server/src/types/dashboard.ts client/src/types/dashboard.ts`
Expected: file exists and is identical (this satisfies the DTO-parity constraint).

- [ ] **Step 2: Create `client/src/api/client.ts`**

```ts
const BASE = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, message: string, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) { onUnauthorized = fn; }

export async function apiFetch<T>(
  path: string,
  opts: { method?: string; body?: unknown; token?: string | null } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 401) { onUnauthorized?.(); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as { error?: { message?: string; code?: string } }).error;
    throw new ApiError(res.status, err?.message ?? 'Request failed', err?.code ?? 'error');
  }
  return data as T;
}
```

- [ ] **Step 3: Create `client/src/auth/AuthContext.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { apiFetch, setUnauthorizedHandler } from '../api/client.js';

interface User { id: string; name: string; email: string; role: string; }
interface AuthValue {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);
const STORAGE_KEY = 'matchday.auth';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try { const p = JSON.parse(raw); setToken(p.token); setUser(p.user); } catch { /* ignore */ }
    }
  }, []);

  const logout = useCallback(() => {
    setToken(null); setUser(null); localStorage.removeItem(STORAGE_KEY);
  }, []);

  useEffect(() => { setUnauthorizedHandler(logout); }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiFetch<{ token: string; user: User }>('/auth/login', {
      method: 'POST', body: { email, password },
    });
    setToken(res.token); setUser(res.user);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(res));
  }, []);

  const value = useMemo(() => ({ user, token, login, logout }), [user, token, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 4: Create `client/src/hooks/useLogin.ts`**

```ts
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext.js';

export function useLogin() {
  const { login } = useAuth();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => login(email, password),
  });
}
```

- [ ] **Step 5: Create `client/src/auth/LoginPage.tsx`**

Port the markup from prototype lines ~1011–1036 (`#v-login`). Bind the form to `useLogin`. Structure:

```tsx
import { type FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../api/client.js';
import { useAuth } from './AuthContext.js';
import { useLogin } from '../hooks/useLogin.js';

export function LoginPage() {
  const [email, setEmail] = useState('admin@matchday.dev');
  const [password, setPassword] = useState('');
  const login = useLogin();
  const navigate = useNavigate();
  const { token } = useAuth();
  if (token) { navigate('/', { replace: true }); }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login.mutateAsync({ email, password });
      navigate('/', { replace: true });
    } catch { /* error surfaced below via login.error */ }
  }

  const errorMsg = login.error instanceof ApiError ? login.error.message : login.error ? 'Login failed' : null;

  // Wrap in the prototype's #auth-screen / .panel / .view markup (see prototype lines 983-1090).
  return (
    <div id="auth-screen">
      <section className="view active" id="v-login" aria-labelledby="login-title">
        <h2 id="login-title">Sign in to MatchDay</h2>
        <form onSubmit={onSubmit}>
          <div className="inp"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" aria-label="Email" /></div>
          <div className="inp"><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" aria-label="Password" /></div>
          {errorMsg && <p className="auth-error" role="alert">{errorMsg}</p>}
          <button className="btn btn-primary" type="submit" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </section>
    </div>
  );
}
```

Keep the surrounding `.panel` / hero markup from the prototype for visual fidelity; the functional core is the form above. Add a small `.auth-error{color:var(--danger);font-size:13px;margin:8px 0}` rule to `theme.css` if not already present.

- [ ] **Step 6: Create `client/src/auth/ProtectedRoute.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.js';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
```

- [ ] **Step 7: Create `client/src/auth/MfaStub.tsx` and `ForgotStub.tsx`**

```tsx
// MfaStub.tsx
import { Link } from 'react-router-dom';
export function MfaStub() {
  return (
    <div id="auth-screen">
      <section className="view active" aria-labelledby="mfa-title">
        <h2 id="mfa-title">Two-factor verification</h2>
        <p>MFA is not enabled in this build.</p>
        <Link className="link" to="/login">Back to sign in</Link>
      </section>
    </div>
  );
}
```
```tsx
// ForgotStub.tsx
import { Link } from 'react-router-dom';
export function ForgotStub() {
  return (
    <div id="auth-screen">
      <section className="view active" aria-labelledby="forgot-title">
        <h2 id="forgot-title">Reset your password</h2>
        <p>Password reset is not enabled in this build.</p>
        <Link className="link" to="/login">Back to sign in</Link>
      </section>
    </div>
  );
}
```

- [ ] **Step 8: Update `client/src/App.tsx` with routes and AuthProvider**

```tsx
import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext.js';
import { ForgotStub } from './auth/ForgotStub.js';
import { LoginPage } from './auth/LoginPage.js';
import { MfaStub } from './auth/MfaStub.js';
import { ProtectedRoute } from './auth/ProtectedRoute.js';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/mfa" element={<MfaStub />} />
        <Route path="/forgot" element={<ForgotStub />} />
        <Route path="/*" element={<ProtectedRoute><div>dashboard placeholder</div></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
```

- [ ] **Step 9: Write the failing test `client/src/test/LoginPage.test.tsx`**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext.js';
import { LoginPage } from '../auth/LoginPage.js';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><AuthProvider><LoginPage /></AuthProvider></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('shows an error message when login fails', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false, status: 401,
      json: async () => ({ error: { message: 'Invalid credentials', code: 'auth' } }),
    });
    renderPage();
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Invalid credentials'));
  });
});
```

- [ ] **Step 10: Run the test**

Run: `npm run test -w client -- LoginPage`
Expected: PASS (1 test).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(client): auth context, login page, protected routes, auth stubs"
```

---

## Task 10: App shell (sidebar, topbar, coming-soon)

**Files:**
- Create: `client/src/components/AppShell.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `ComingSoon.tsx`
- Modify: `client/src/App.tsx` (wrap protected area in `AppShell`, add coming-soon routes)

**Interfaces:**
- Consumes: prototype sidebar markup (lines ~1093–1109) and topbar (lines ~1120–1128); `useAuth` for the user chip + logout.
- Produces: `AppShell` wrapping page content; `ComingSoon` placeholder page.

- [ ] **Step 1: Create `client/src/components/Sidebar.tsx`**

Port the nav markup from prototype lines ~1093–1109. Command Center links to `/`; every other item links to `/coming-soon/<slug>`. Use `NavLink` so the active class matches the prototype's `.nav-item.active`.

```tsx
import { NavLink } from 'react-router-dom';

const NAV = [
  { label: 'Command Center', icon: 'ti-layout-dashboard', to: '/' },
  { label: 'Drives', icon: 'ti-calendar-event', to: '/coming-soon/drives', count: 12 },
  { label: 'Institutes', icon: 'ti-building-community', to: '/coming-soon/institutes', count: 21, group: 'Supply' },
  { label: 'Jobseekers', icon: 'ti-users', to: '/coming-soon/jobseekers' },
  { label: 'Evaluations', icon: 'ti-clipboard-check', to: '/coming-soon/evaluations' },
  { label: 'Templates', icon: 'ti-template', to: '/coming-soon/templates' },
  { label: 'Streams', icon: 'ti-git-branch', to: '/coming-soon/streams' },
  { label: 'Employers', icon: 'ti-briefcase', to: '/coming-soon/employers', count: 48, group: 'Demand' },
  { label: 'Recruiters', icon: 'ti-user-search', to: '/coming-soon/recruiters' },
  { label: 'Slots', icon: 'ti-calendar-time', to: '/coming-soon/slots' },
  { label: 'Reports', icon: 'ti-chart-bar', to: '/coming-soon/reports', group: 'Operate' },
  { label: 'Audit Trail', icon: 'ti-history', to: '/coming-soon/audit' },
  { label: 'Settings', icon: 'ti-settings', to: '/coming-soon/settings' },
];

export function Sidebar() {
  return (
    <nav className="sidebar">
      {NAV.map((item) => (
        <div key={item.to}>
          {item.group && <div className="nav-label">{item.group}</div>}
          <NavLink to={item.to} end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
            <i className={`ti ${item.icon}`} /> {item.label}
            {item.count != null && <span className="count">{item.count}</span>}
          </NavLink>
        </div>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Create `client/src/components/Topbar.tsx`**

Port from prototype lines ~1120–1128. Accept `crumb` and `title` props; render the user chip from `useAuth().user` with a logout button.

```tsx
import { useAuth } from '../auth/AuthContext.js';

export function Topbar({ crumb, title }: { crumb: string; title: string }) {
  const { user, logout } = useAuth();
  return (
    <header className="topbar">
      <div><div className="crumb">{crumb}</div><h1>{title}</h1></div>
      <div className="grow" />
      <div className="user-chip">
        <span id="userName">{user?.name ?? 'Platform Admin'}</span>
        <button className="btn btn-ghost" onClick={logout}><i className="ti ti-logout" /> Sign out</button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Create `client/src/components/AppShell.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar.js';
import { Topbar } from './Topbar.js';

export function AppShell({ crumb, title, children }: { crumb: string; title: string; children: ReactNode }) {
  return (
    <div className="shell">
      <Sidebar />
      <div className="main">
        <Topbar crumb={crumb} title={title} />
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `client/src/components/ComingSoon.tsx`**

```tsx
import { useParams } from 'react-router-dom';
import { AppShell } from './AppShell.js';

export function ComingSoon() {
  const { slug } = useParams();
  const name = (slug ?? 'This module').replace(/(^|-)([a-z])/g, (_, s, c) => (s ? ' ' : '') + c.toUpperCase());
  return (
    <AppShell crumb="Coming soon" title={name}>
      <div className="content"><div className="card"><div className="card-h"><h3>{name}</h3></div>
        <p style={{ padding: '20px', color: 'var(--muted)' }}>This module is not part of the current build yet. Command Center is live — pick it from the sidebar.</p>
      </div></div>
    </AppShell>
  );
}
```

- [ ] **Step 5: Wire coming-soon route into `client/src/App.tsx`**

Add import and route inside the protected area:

```tsx
import { ComingSoon } from './components/ComingSoon.js';
```
```tsx
        <Route path="/coming-soon/:slug" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
```

- [ ] **Step 6: Verify visually**

Run: `npm run dev` (root — starts server + client), log in with the seeded admin, confirm the sidebar + topbar render like the prototype and coming-soon pages load.
Expected: shell matches the prototype; nav highlights correctly.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(client): app shell with ported sidebar, topbar, and coming-soon pages"
```

---

## Task 11: Dashboard page + section components

**Files:**
- Create: `client/src/hooks/useDashboardOverview.ts`, `client/src/pages/Dashboard/index.tsx`, `ReadinessHero.tsx`, `KpiSection.tsx`, `FunnelsSection.tsx`, `ScheduleSection.tsx`, `LeaderboardsSection.tsx`
- Modify: `client/src/App.tsx` (mount Dashboard at `/`)
- Test: `client/src/test/KpiSection.test.tsx`

**Interfaces:**
- Consumes: `DashboardOverview` type, `apiFetch`, `useAuth().token`, and prototype dashboard markup (lines ~1131–1341).
- Produces:
  - `useDashboardOverview()` → TanStack Query returning `DashboardOverview`.
  - `Dashboard` page composing the five sections; each section takes its slice of the DTO as props.

- [ ] **Step 1: Create `client/src/hooks/useDashboardOverview.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import type { DashboardOverview } from '../types/dashboard.js';

export function useDashboardOverview() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => apiFetch<DashboardOverview>('/dashboard/overview', { token }),
    enabled: !!token,
  });
}
```

- [ ] **Step 2: Create `client/src/pages/Dashboard/KpiSection.tsx`**

Port the KPI table/cards markup from prototype lines ~1179–1227. Render from `kpis` prop; keep the Table/Cards toggle.

```tsx
import { useState } from 'react';
import type { DashboardOverview } from '../../types/dashboard.js';

export function KpiSection({ kpis }: { kpis: DashboardOverview['kpis'] }) {
  const [view, setView] = useState<'table' | 'cards'>('table');
  return (
    <>
      <div className="section-title">Key metrics <span className="rule" />
        <span className="seg" role="tablist">
          <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}><i className="ti ti-table" /> Table</button>
          <button className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}><i className="ti ti-layout-grid" /> Cards</button>
        </span>
      </div>
      {view === 'table' ? (
        <div className="mtable"><table>
          <thead><tr><th>Metric</th><th className="r">Value</th><th className="r">Change (30d)</th><th className="colgrp">Group</th></tr></thead>
          <tbody>
            {kpis.map((k) => (
              <tr key={k.key}>
                <td><div className="mname">{k.label}</div></td>
                <td className="r"><span className="mval">{k.display}</span></td>
                <td className="r"><span className={`mchg ${k.delta.direction}`}>{k.delta.display}</span></td>
                <td className="colgrp"><span className="grp">{k.group}</span></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      ) : (
        <div className="kpis">
          {kpis.map((k) => (
            <div className="kpi" key={k.key}>
              <div className="kh">{k.label}</div>
              <div className="kv mono">{k.display}</div>
              <div className={`kd ${k.delta.direction}`}>{k.delta.display}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Create `client/src/pages/Dashboard/ReadinessHero.tsx`**

Port the hero markup from prototype lines ~1143–1177. Compute the gauge `stroke-dashoffset` from `readiness.score` (`circumference = 2π·56 ≈ 351.8`; `offset = 351.8 · (1 − score/100)`).

```tsx
import type { DashboardOverview } from '../../types/dashboard.js';

const C = 351.8;
export function ReadinessHero({ readiness }: { readiness: DashboardOverview['readiness'] }) {
  const offset = (C * (1 - readiness.score / 100)).toFixed(1);
  return (
    <div className="hero">
      <div className="hero-left">
        <div className="q"><i className="ti ti-target-arrow" /> Readiness check</div>
        <h2>Are we ready for the next MatchDay?</h2>
        <div className="gauge-wrap">
          <div className="gauge">
            <svg width="132" height="132" viewBox="0 0 132 132">
              <circle cx="66" cy="66" r="56" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="12" />
              <circle cx="66" cy="66" r="56" fill="none" stroke="#fff" strokeWidth="12" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={offset} />
            </svg>
            <div className="val"><span className="n mono">{readiness.score}</span><span className="u">of 100</span></div>
          </div>
          <div className="verdict">
            <span className="badge"><i className="ti ti-circle-check" /> {readiness.verdict.label}</span>
            {readiness.attention && <p>{readiness.attention.message}</p>}
          </div>
        </div>
        <div className="countdown">
          <div className="cd-box"><div className="n mono">{readiness.countdown.days}</div><div className="k">days</div></div>
          <div className="cd-when">Kickoff <b>{new Date(readiness.nextMatchDay).toDateString()}</b></div>
        </div>
      </div>
      <div className="hero-right">
        <div className="hr-top"><h3>What's feeding the score</h3></div>
        <div className="pillars">
          {readiness.pillars.map((p) => (
            <div className="pillar" key={p.key}>
              <div className="ph">{p.key}</div>
              <div className="pn mono">{p.pct}<small>%</small></div>
              <div className="bar"><i style={{ width: `${p.pct}%` }} /></div>
              <div className="pf">{p.caption}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `client/src/pages/Dashboard/FunnelsSection.tsx`**

Port funnel markup from prototype lines ~1229–1262. Render three `.card`s from `funnels.supply/demand/hiring`.

```tsx
import type { DashboardOverview, FunnelStep } from '../../types/dashboard.js';

function Funnel({ title, sub, steps }: { title: string; sub: string; steps: FunnelStep[] }) {
  const max = steps[0]?.value || 1;
  return (
    <div className="card">
      <div className="card-h"><div><h3>{title}</h3><div className="sub">{sub}</div></div></div>
      <div className="funnel">
        {steps.map((s) => (
          <div className="fstep" key={s.name}>
            <div className="fl"><span className="name">{s.name}</span>
              <span className="v mono">{s.value.toLocaleString('en-US')}{s.pct != null && <span className="pct"> {s.pct}%</span>}</span></div>
            <div className="ftrack"><i style={{ width: `${Math.round((s.value / max) * 100)}%` }} /></div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FunnelsSection({ funnels }: { funnels: DashboardOverview['funnels'] }) {
  return (
    <>
      <div className="section-title">Conversion funnels <span className="rule" /></div>
      <div className="grid-3">
        <Funnel title="Supply Funnel" sub="Jobseeker → match-ready" steps={funnels.supply} />
        <Funnel title="Demand Funnel" sub="Employer → booked slots" steps={funnels.demand} />
        <Funnel title="Hiring Funnel" sub="Match-ready → joined" steps={funnels.hiring} />
      </div>
    </>
  );
}
```

- [ ] **Step 5: Create `client/src/pages/Dashboard/ScheduleSection.tsx`**

Port calendar + slot-donut markup from prototype lines ~1264–1303. Render `schedule.calendar`, `schedule.events`, and `slotUtilization` (donut offset: `circumference = 2π·54 ≈ 339.3`, `offset = 339.3·(1 − utilizedPct/100)`).

```tsx
import type { DashboardOverview } from '../../types/dashboard.js';

const C = 339.3;
export function ScheduleSection({ schedule, slot }: { schedule: DashboardOverview['schedule']; slot: DashboardOverview['slotUtilization'] }) {
  const offset = (C * (1 - slot.utilizedPct / 100)).toFixed(1);
  return (
    <>
      <div className="section-title">Schedule &amp; capacity <span className="rule" /></div>
      <div className="grid-2">
        <div className="card">
          <div className="card-h"><div><h3>Upcoming Events</h3><div className="sub">{schedule.monthLabel} · Wednesdays are MatchDays</div></div></div>
          <div className="cal"><div className="cal-grid">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div className="dow" key={i}>{d}</div>)}
            {schedule.calendar.map((c, i) => (
              <div key={i} className={`cal-cell${!c.inMonth ? ' mute' : ''}${c.isWed ? ' wed' : ''}${c.isToday ? ' today' : ''}${c.isNextMatchDay ? ' next' : ''}`}>
                {c.inMonth ? c.day : ''}
              </div>
            ))}
          </div></div>
          <div className="events">
            {schedule.events.map((e) => (
              <div className="event" key={e.date}>
                <div className="ed"><div className="d mono">{new Date(e.date).getUTCDate()}</div><div className="m">{new Date(e.date).toLocaleString('en-US', { month: 'short' })}</div></div>
                <div className="ei"><b>{e.title}</b><span>{e.employers} employers · {e.slots} slots · {e.candidates} candidates</span></div>
                <span className={`estat ${e.status}`}>{e.status === 'prep' ? `Prep ${e.prepPct}%` : 'Open'}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <div className="card-h"><div><h3>Slot Utilization</h3><div className="sub">Next MatchDay</div></div></div>
          <div className="slot">
            <div className="donut">
              <svg width="130" height="130" viewBox="0 0 130 130">
                <circle cx="65" cy="65" r="54" fill="none" stroke="var(--indigo-050)" strokeWidth="14" />
                <circle cx="65" cy="65" r="54" fill="none" stroke="var(--indigo)" strokeWidth="14" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={offset} />
              </svg>
              <div className="center"><span className="n mono">{slot.utilizedPct}%</span><span className="k">utilized</span></div>
            </div>
            <div className="slot-legend">
              <div className="lg"><span className="lgn"><span className="sw" style={{ background: 'var(--indigo)' }} /> Booked</span><span className="lgv">{slot.booked}</span></div>
              <div className="lg"><span className="lgn"><span className="sw" style={{ background: 'var(--violet)' }} /> Held / pending</span><span className="lgv">{slot.held}</span></div>
              <div className="lg"><span className="lgn"><span className="sw" style={{ background: 'var(--indigo-100)' }} /> Available</span><span className="lgv">{slot.available}</span></div>
              <div className="lg"><span className="lgn"><span className="sw" style={{ background: 'var(--line-strong)' }} /> Total capacity</span><span className="lgv">{slot.total}</span></div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 6: Create `client/src/pages/Dashboard/LeaderboardsSection.tsx`**

Port leaderboard markup from prototype lines ~1305–1334. Render `leaderboards.institutes` and `leaderboards.employers`.

```tsx
import type { DashboardOverview } from '../../types/dashboard.js';

function rankClass(rank: number) { return rank <= 3 ? `rank g${rank}` : 'rank'; }

export function LeaderboardsSection({ leaderboards }: { leaderboards: DashboardOverview['leaderboards'] }) {
  return (
    <>
      <div className="section-title">Leaderboards <span className="rule" /></div>
      <div className="grid-2b">
        <div className="card">
          <div className="card-h"><div><h3>Institute Leaderboard</h3><div className="sub">By match-ready candidates supplied</div></div></div>
          <div className="lb"><table>
            <thead><tr><th style={{ width: 36 }} /><th>Institute</th><th className="r">Ready</th><th className="r">Conversion</th></tr></thead>
            <tbody>{leaderboards.institutes.map((r) => (
              <tr key={r.rank}><td><span className={rankClass(r.rank)}>{r.rank}</span></td>
                <td><div className="org"><div><b>{r.name}</b><span>{r.city}</span></div></div></td>
                <td className="r"><b className="mono">{r.ready}</b></td>
                <td className="r"><span className="mini"><i style={{ width: `${r.conversionPct}%` }} /></span> {r.conversionPct}%</td></tr>
            ))}</tbody>
          </table></div>
        </div>
        <div className="card">
          <div className="card-h"><div><h3>Employer Leaderboard</h3><div className="sub">By offers extended this cycle</div></div></div>
          <div className="lb"><table>
            <thead><tr><th style={{ width: 36 }} /><th>Employer</th><th className="r">Offers</th><th className="r">Fill rate</th></tr></thead>
            <tbody>{leaderboards.employers.map((r) => (
              <tr key={r.rank}><td><span className={rankClass(r.rank)}>{r.rank}</span></td>
                <td><div className="org"><div><b>{r.name}</b><span>{r.industry}</span></div></div></td>
                <td className="r"><b className="mono">{r.offers}</b></td>
                <td className="r"><span className="mini"><i style={{ width: `${r.fillRatePct}%` }} /></span> {r.fillRatePct}%</td></tr>
            ))}</tbody>
          </table></div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 7: Create `client/src/pages/Dashboard/index.tsx`**

```tsx
import { AppShell } from '../../components/AppShell.js';
import { useDashboardOverview } from '../../hooks/useDashboardOverview.js';
import { FunnelsSection } from './FunnelsSection.js';
import { KpiSection } from './KpiSection.js';
import { LeaderboardsSection } from './LeaderboardsSection.js';
import { ReadinessHero } from './ReadinessHero.js';
import { ScheduleSection } from './ScheduleSection.js';

export function Dashboard() {
  const { data, isLoading, isError, error } = useDashboardOverview();
  return (
    <AppShell crumb="Overview" title="Command Center">
      <div className="content">
        {isLoading && <div className="card"><p style={{ padding: 20 }}>Loading dashboard…</p></div>}
        {isError && <div className="card"><p style={{ padding: 20, color: 'var(--danger)' }}>Failed to load: {(error as Error)?.message}</p></div>}
        {data && (
          <>
            <ReadinessHero readiness={data.readiness} />
            <KpiSection kpis={data.kpis} />
            <FunnelsSection funnels={data.funnels} />
            <ScheduleSection schedule={data.schedule} slot={data.slotUtilization} />
            <LeaderboardsSection leaderboards={data.leaderboards} />
          </>
        )}
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 8: Mount Dashboard at `/` in `client/src/App.tsx`**

Replace the `<div>dashboard placeholder</div>` with `<Dashboard />` and import it:

```tsx
import { Dashboard } from './pages/Dashboard/index.js';
```
```tsx
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
```

- [ ] **Step 9: Write the failing test `client/src/test/KpiSection.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KpiSection } from '../pages/Dashboard/KpiSection.js';
import type { DashboardOverview } from '../types/dashboard.js';

const kpis: DashboardOverview['kpis'] = [
  { key: 'activeDrives', label: 'Active Drives', group: 'Demand', value: 12, display: '12', delta: { value: 2, direction: 'up', display: '+2' } },
  { key: 'joined', label: 'Joined Candidates', group: 'Outcomes', value: 41, display: '41', delta: { value: 12, direction: 'up', display: '+12' } },
];

describe('KpiSection', () => {
  it('renders KPI rows with values and deltas', () => {
    render(<KpiSection kpis={kpis} />);
    expect(screen.getByText('Active Drives')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('+2')).toBeInTheDocument();
    expect(screen.getByText('Joined Candidates')).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run the test**

Run: `npm run test -w client -- KpiSection`
Expected: PASS (1 test).

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(client): live Command Center dashboard with all five sections"
```

---

## Task 12: End-to-end verification

**Files:**
- Create: `README.md` (root, run instructions)

**Interfaces:** none — this task proves the slice works end-to-end.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all server suites PASS and all client suites PASS.

- [ ] **Step 2: Seed and start the app**

Run (with `mongod` running): `npm run seed && npm run dev`
Expected: server on `:4000`, client on `:5173`, seed prints the admin login.

- [ ] **Step 3: Manual smoke test**

In the browser at `http://localhost:5173`:
1. You are redirected to `/login`.
2. Sign in with `admin@matchday.dev` / `Password123!`.
3. Command Center loads; readiness score, KPIs (~12 active drives, 1,284 jobseekers, 531 match-ready, 288/360 slots), three funnels, calendar with Jul 15/22/29 Wednesdays highlighted, 80% slot donut, and both leaderboards render with the ported look.
4. Toggle KPI Table/Cards.
5. Click a sidebar item → coming-soon page. Click Command Center → back to dashboard.
6. Sign out → redirected to `/login`. Reload a protected URL while signed out → redirected to `/login`.

Expected: all steps behave as described; numbers match the seed.

- [ ] **Step 4: Create root `README.md`**

```markdown
# MatchDay Admin (MERN)

Command Center vertical slice — see `docs/superpowers/specs/2026-07-14-matchday-command-center-design.md`.

## Prerequisites
- Node 20+
- A local MongoDB running at `mongodb://localhost:27017`

## Setup
```bash
npm install
cp server/.env.example server/.env
cp client/.env.example client/.env
npm run seed        # seeds the DB, prints the admin login
npm run dev         # server :4000 + client :5173
```

Sign in with the admin credentials printed by the seed (`admin@matchday.dev` / `Password123!`).

## Tests
```bash
npm test            # server (vitest+supertest) and client (vitest+RTL)
```
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "docs: add root README and verify end-to-end slice"
```

---

## Self-Review Notes (author checklist — resolved)

- **Spec coverage:** auth (T4/T9) · six models (T3) · live aggregation for readiness/KPIs/funnels/schedule/slots/leaderboards (T5) · protected endpoint (T6) · seed with 30-day-delta spread (T7) · faithful CSS/font port (T8) · shell + coming-soon stubs (T10) · dashboard UI (T11) · MFA/reset visual stubs (T9) · local mongod config (T2/T7/T12). ✔
- **Placeholder scan:** the only "copy from source" steps are the verbatim CSS paste (T8.8) and the JSX markup ports (T9/T11), which reference exact prototype line ranges — the authored logic (services, hooks, aggregation) is complete. ✔
- **Type consistency:** `DashboardOverview`/`FunnelStep` defined once (T5.1) and copied to the client (T9.1); `getOverview(now?)`, `apiFetch`, `useAuth`, `signToken` signatures are consistent across tasks. ✔
