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
