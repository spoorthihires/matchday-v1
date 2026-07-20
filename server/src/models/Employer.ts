import { Schema, model, type InferSchemaType } from 'mongoose';

const employerSchema = new Schema({
  name: { type: String, required: true },
  industry: { type: String, required: true },
  status: { type: String, enum: ['Active', 'Pending', 'Disabled'], default: 'Active' },
  offersExtended: { type: Number, default: 0 },
  slotsFillRate: { type: Number, default: 0 },
  size: { type: String, enum: ['1–50', '51–200', '201–1000', '1000+'], default: '51–200' },
  spoc: { type: String, default: '' },
  email: { type: String, default: '' },
  candidatesViewed: { type: Number, default: 0 },
  shortlistRate: { type: Number, default: 0 },
  offerRate: { type: Number, default: 0 },
  respHours: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  passwordHash: { type: String, default: undefined },
  website: { type: String, default: '' },
  hiringType: { type: String, default: '' },
  workLocations: { type: [String], default: [] },
  designation: { type: String, default: '' },
  phone: { type: String, default: '' },
  billingContact: { type: String, default: '' },
  gstNumber: { type: String, default: '' },
});

// Never serialize passwordHash out of this model -- covers current AND future endpoints
// that do `res.json(employerDoc)` (e.g. GET/PATCH /api/employers/:id in employers.service.ts,
// which return the raw Mongoose doc). Doesn't affect direct property access
// (employer.passwordHash) used by auth.service.login, since that reads the doc field, not
// the serialized JSON.
employerSchema.set('toJSON', { transform: (_doc, ret) => { delete ret.passwordHash; return ret; } });
employerSchema.set('toObject', { transform: (_doc, ret) => { delete ret.passwordHash; return ret; } });

export type EmployerDoc = InferSchemaType<typeof employerSchema>;
export const Employer = model('Employer', employerSchema);
