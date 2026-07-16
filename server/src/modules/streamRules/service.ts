import { StreamRules } from '../../models/StreamRules.js';
import type { StreamRulesInput } from './stream-rules.schemas.js';

export const SR_DEFAULTS: StreamRulesInput = {
  numAllowed: '2', requirePrimary: true, defaultPrimary: 'First selected stream',
  allowSecondary: true, maxSecondary: 2, changePolicy: 'Before evaluation only', cooldown: 14,
  reuseEval: true, reuseScope: 'Same domain only', validityDays: 90, validityExpires: true,
  autoSuggest: true, suggestBasis: 'Skills + evaluations', confidence: 70,
};

export interface StreamRulesView extends StreamRulesInput { updatedAt: string }

function toView(d: Record<string, unknown>): StreamRulesView {
  return {
    numAllowed: d.numAllowed as StreamRulesInput['numAllowed'], requirePrimary: !!d.requirePrimary,
    defaultPrimary: String(d.defaultPrimary), allowSecondary: !!d.allowSecondary, maxSecondary: Number(d.maxSecondary),
    changePolicy: d.changePolicy as StreamRulesInput['changePolicy'], cooldown: Number(d.cooldown),
    reuseEval: !!d.reuseEval, reuseScope: d.reuseScope as StreamRulesInput['reuseScope'],
    validityDays: Number(d.validityDays), validityExpires: !!d.validityExpires, autoSuggest: !!d.autoSuggest,
    suggestBasis: d.suggestBasis as StreamRulesInput['suggestBasis'], confidence: Number(d.confidence),
    updatedAt: new Date(d.updatedAt as Date).toISOString(),
  };
}

export async function getStreamRules(): Promise<StreamRulesView> {
  let doc = await StreamRules.findOne().lean();
  if (!doc) { await StreamRules.create({ ...SR_DEFAULTS }); doc = await StreamRules.findOne().lean(); }
  return toView(doc as Record<string, unknown>);
}
export async function saveStreamRules(input: StreamRulesInput): Promise<StreamRulesView> {
  const doc = await StreamRules.findOneAndUpdate({}, { ...input, updatedAt: new Date() }, { new: true, upsert: true, setDefaultsOnInsert: true }).lean();
  return toView(doc as Record<string, unknown>);
}
