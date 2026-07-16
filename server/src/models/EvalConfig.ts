import { Schema, model, type InferSchemaType } from 'mongoose';

const evalConfigSchema = new Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['MCQ', 'Coding', 'TARA', 'Assignments'], default: 'MCQ' },
  enabled: { type: Boolean, default: true },
  passing: { type: Number, default: 60 },
  attempts: { type: Number, default: 2 },
  retake: { type: String, default: 'After cooldown' },
  cooldown: { type: Number, default: 2 },
  validity: { type: Number, default: 90 },
  autoQual: { type: Boolean, default: false },
  threshold: { type: Number, default: 70 },
  contests: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export type EvalConfigDoc = InferSchemaType<typeof evalConfigSchema>;
export const EvalConfig = model('EvalConfig', evalConfigSchema);
