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
});

export type EmployerDoc = InferSchemaType<typeof employerSchema>;
export const Employer = model('Employer', employerSchema);
