import type { z } from 'zod';
import type { officeEventSchema } from './schemas';

export type OfficeEvent = z.infer<typeof officeEventSchema>;
export type OfficeEventType = OfficeEvent['type'];
