import { z } from 'zod';

const registrationDetailsSchema = z.object({
  roleDescription: z.string().optional(),
  deadline: z.string().optional(),
  urgency: z.string().optional(),
  goodToHave: z.array(z.string()).optional(),
  qualification: z.string().optional(),
  gradYearFrom: z.number().optional(),
  gradYearTo: z.number().optional(),
  expMin: z.number().optional(),
  expMax: z.number().optional(),
  ctcMin: z.number().optional(),
  ctcMax: z.number().optional(),
  stipend: z.number().optional(),
  cities: z.array(z.string()).optional(),
  workMode: z.string().optional(),
  officeLocation: z.string().optional(),
  rounds: z.number().optional(),
  roundNames: z.string().optional(),
  preferredWednesday: z.string().optional(),
  timeSlot: z.string().optional(),
  minEvalScore: z.number().optional(),
  mandatorySkills: z.array(z.string()).optional(),
}).partial();

// Server-authoritative fields (company/industry/submittedBy/employerId) are
// deliberately NOT part of this schema: they are derived from the
// authenticated Employer profile in the service layer, never from the
// client body (see createEmployerRegistration).
export const createRegistrationSchema = z.object({
  driveId: z.string().min(1),
  role: z.string().trim().min(1),
  openings: z.number().int().min(1).optional(),
  ctcMin: z.number().optional(),
  ctcMax: z.number().optional(),
  mustHave: z.array(z.string()).optional(),
  preferredWednesday: z.string().optional(),
  timeSlot: z.string().optional(),
  jd: z.string().optional(),
  details: registrationDetailsSchema.optional(),
});

export type RegistrationInput = z.infer<typeof createRegistrationSchema>;

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// Server-authoritative: employerId comes from the JWT, driveId from the route
// param — neither is accepted in the body.
export const createSlotSchema = z.object({
  date: z.coerce.date(),
  start: z.string().regex(TIME_RE, 'Invalid time'),
  end: z.string().regex(TIME_RE, 'Invalid time'),
  capacity: z.number().int().min(1).max(50),
  linkMode: z.enum(['auto', 'own']),
  link: z.string().url().optional(),
}).refine((v) => v.linkMode !== 'own' || !!(v.link && v.link.length), { message: 'A meeting link is required', path: ['link'] });

export const updateSlotSchema = z.object({
  date: z.coerce.date().optional(),
  start: z.string().regex(TIME_RE).optional(),
  end: z.string().regex(TIME_RE).optional(),
  capacity: z.number().int().min(1).max(50).optional(),
  linkMode: z.enum(['auto', 'own']).optional(),
  link: z.string().url().optional(),
});

export type SlotInput = z.infer<typeof createSlotSchema>;
export type SlotPatch = z.infer<typeof updateSlotSchema>;
