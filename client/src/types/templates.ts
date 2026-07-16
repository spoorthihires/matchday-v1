// Mirrors server/src/modules/templates/templates.service.ts TemplateItem and
// server/src/modules/templates/templates.schemas.ts (createTemplateSchema / sectionsSchema).

export const TEMPLATE_DOMAINS = ['Data / Analytics', 'Data Engineering', 'Machine Learning', 'GenAI', 'Business'] as const;
export type TemplateDomain = (typeof TEMPLATE_DOMAINS)[number];
export const NOTIF_CHANNELS = ['Email', 'WhatsApp', 'Bell'] as const;
export type NotifChannel = (typeof NOTIF_CHANNELS)[number];
export type TemplateStatus = 'Active' | 'Inactive';

export interface TemplateSections {
  assessment: { mcq: boolean; coding: boolean; tara: boolean; assignments: boolean };
  weightage: Record<string, number>;
  matching: Record<string, number>;   // includes 'threshold'
  kanban: string[];
  notifications: { name: string; ch: string[] }[];
  privacy: Record<string, boolean>;
}

export interface TemplateVersion { v: string; date: string; by: string; note: string }

export interface TemplateItem {
  id: string; code: string; name: string; domain: string;
  status: TemplateStatus; usedBy: number;
  sections: TemplateSections; version: string; versions: TemplateVersion[];
  createdAt: string; updatedAt: string;
}

export interface TemplateInput {
  name: string; domain: string; status: TemplateStatus; sections: TemplateSections;
}

export interface TemplateListParams { q?: string; domain?: string; status?: string }
export interface TemplateListResponse { items: TemplateItem[] }
