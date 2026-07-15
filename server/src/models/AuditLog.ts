import { Schema, model, type InferSchemaType } from 'mongoose';

const auditLogSchema = new Schema({
  entityType: { type: String, required: true },
  entityId: { type: Schema.Types.ObjectId, required: true },
  action: { type: String, required: true },
  actor: { type: String, default: 'Platform Admin' },
  detail: { type: String, default: '' },
  at: { type: Date, default: Date.now },
});
auditLogSchema.index({ entityType: 1, entityId: 1, at: -1 });

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema>;
export const AuditLog = model('AuditLog', auditLogSchema);
