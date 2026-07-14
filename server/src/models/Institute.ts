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
