import { Schema, model, type InferSchemaType } from 'mongoose';

const versionSchema = new Schema(
  {
    v: { type: String, required: true },
    date: { type: Date, required: true },
    by: { type: String, required: true },
    note: { type: String, default: '' },
  },
  { _id: false },
);

const templateSchema = new Schema({
  name: { type: String, required: true },
  domain: { type: String, required: true },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  // The prototype's section config uses keys with spaces ("Domain fit", "Mask contact until shortlist"),
  // so it is stored as Mixed; the exact shape is enforced by zod at the API layer.
  sections: { type: Schema.Types.Mixed, required: true },
  version: { type: String, default: '1.0' },
  versions: { type: [versionSchema], default: [] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

export type DriveTemplateDoc = InferSchemaType<typeof templateSchema>;
export const DriveTemplate = model('DriveTemplate', templateSchema);
