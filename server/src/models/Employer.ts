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
