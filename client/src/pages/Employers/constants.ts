// Transcribed verbatim from the prototype's #empfIndustry/#empmIndustry/#empmSize/#empmStatus
// <option> lists (matchday-admin-app_23.html lines 1897, 1948-1949, 1952) and matching the
// server's INDUSTRIES/SIZES enums + status enum (server/src/modules/employers/employers.schemas.ts)
// so filters and the create/edit modal stay in sync with what the API will accept.

export const INDUSTRY_OPTIONS = ['Product · SaaS', 'Fintech', 'ML / AI Platform', 'Cloud Infra', 'Enterprise', 'E-commerce'];
export const SIZE_OPTIONS = ['1–50', '51–200', '201–1000', '1000+'];
export const STATUS_OPTIONS = ['Active', 'Pending', 'Disabled'];
