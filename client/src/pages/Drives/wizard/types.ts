import type { DriveInput } from '../../../types/drives.js';

// Shared prop contract for the six wizard step components (Task 7). Every step binds its
// fields to `model` and writes back through `onChange`; `errors` is the current step's
// `validateStep(step, model)` result, only non-empty once the wizard shell has attempted to
// advance past this step and failed.
export interface WizardStepProps {
  model: DriveInput;
  onChange: (patch: Partial<DriveInput>) => void;
  errors: string[];
}
