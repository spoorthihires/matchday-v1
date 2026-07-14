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
