import type { z } from 'zod';
import type { officeErrorSchema, officeErrorBodySchema } from './schemas';

export type OfficeError = z.infer<typeof officeErrorSchema>;
export type OfficeErrorBody = z.infer<typeof officeErrorBodySchema>;
