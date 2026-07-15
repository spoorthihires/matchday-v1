import { Schema, model, type InferSchemaType } from 'mongoose';

const ownershipEntrySchema = new Schema({
  owner: { type: String, default: '' },
  email: { type: String, default: '' },
  changedAt: { type: Date, default: Date.now },
  changedBy: { type: String, default: 'Platform Admin' },
}, { _id: false });

const instituteSchema = new Schema({
  name: { type: String, required: true },
  city: { type: String, required: true },
  type: { type: String, required: true },            // free string at the model layer; zod enforces the enum
  status: { type: String, enum: ['Active', 'Pending', 'Disabled'], default: 'Active' },
  owner: { type: String, default: '' },
  email: { type: String, default: '' },
  ownershipHistory: { type: [ownershipEntrySchema], default: [] },
  createdAt: { type: Date, default: Date.now },       // explicit — NOT timestamps
});

export type InstituteDoc = InferSchemaType<typeof instituteSchema>;
export const Institute = model('Institute', instituteSchema);
