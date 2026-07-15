// Shared option lists — transcribed verbatim from the prototype's #ifType/#ifStatus and
// #imType/#imStatus <option> lists (matchday-admin-app_23.html lines 1519-1521, 1555-1560).
// They also match the server's createInstituteSchema TYPES / status enum
// (server/src/modules/institutes/institutes.schemas.ts), and are shared by InstitutesToolbar
// (filters) and InstituteModal (create/edit form) so the two stay in sync.

export const TYPE_OPTIONS = ['Engineering College', 'University', 'Autonomous Institute', 'Bootcamp'];
export const STATUS_OPTIONS = ['Active', 'Pending', 'Disabled'];
