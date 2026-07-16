import { Schema, model, type InferSchemaType } from 'mongoose';

const versionSchema = new Schema(
  { v: { type: String, required: true }, date: { type: Date, required: true }, by: { type: String, required: true }, note: { type: String, default: '' } },
  { _id: false },
);

const streamSchema = new Schema({
  name: { type: String, required: true },
  parent: { type: String, enum: ['Engineering', 'Data Science', 'Business', 'Design', 'Product'], default: 'Engineering' },
  label: { type: String, default: '' },
  skills: { type: [String], default: [] },
  good: { type: [String], default: [] },
  flow: { type: [String], default: [] },
  cutoff: { type: Number, default: 65 },
  cgpa: { type: Number, default: 6.5 },
  backlogs: { type: Number, default: 1 },
  grad: { type: [String], default: [] },
  branches: { type: [String], default: [] },
  sources: { type: [String], default: [] },
  status: { type: String, enum: ['Active', 'Disabled'], default: 'Active' },
  version: { type: String, default: '1.0' },
  versions: { type: [versionSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export type StreamDoc = InferSchemaType<typeof streamSchema>;
export const Stream = model('Stream', streamSchema);
