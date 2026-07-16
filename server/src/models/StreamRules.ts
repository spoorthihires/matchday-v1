import { Schema, model, type InferSchemaType } from 'mongoose';

const streamRulesSchema = new Schema({
  numAllowed: { type: String, default: '2' },
  requirePrimary: { type: Boolean, default: true },
  defaultPrimary: { type: String, default: 'First selected stream' },
  allowSecondary: { type: Boolean, default: true },
  maxSecondary: { type: Number, default: 2 },
  changePolicy: { type: String, default: 'Before evaluation only' },
  cooldown: { type: Number, default: 14 },
  reuseEval: { type: Boolean, default: true },
  reuseScope: { type: String, default: 'Same domain only' },
  validityDays: { type: Number, default: 90 },
  validityExpires: { type: Boolean, default: true },
  autoSuggest: { type: Boolean, default: true },
  suggestBasis: { type: String, default: 'Skills + evaluations' },
  confidence: { type: Number, default: 70 },
  updatedAt: { type: Date, default: Date.now },
});

export type StreamRulesDoc = InferSchemaType<typeof streamRulesSchema>;
export const StreamRules = model('StreamRules', streamRulesSchema);
