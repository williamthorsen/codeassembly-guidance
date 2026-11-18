import { z } from 'zod';

/** Matches a `YYYY-MM-DD` string that names a real calendar date. */
export const CalendarDateSchema = z.string().refine(isCalendarDate, { message: 'expected a YYYY-MM-DD calendar date' });

/** How a workstream stands against its plan. */
export const HealthSchema = z.enum(['at-risk', 'off-track', 'on-track']);

export type Health = z.infer<typeof HealthSchema>;

/** One work item in the normalized shape that every source supplies: facts about the item, never a status. */
export const ProgressItemSchema = z
  .strictObject({
    closed: z.boolean(),
    /** Whether the item was closed as completed; ignored for an open item. */
    completed: z.boolean(),
    completedOn: CalendarDateSchema.nullable(),
    /** Context for writing the item's details; never rendered. */
    description: z.string().nullable(),
    /** The item's identifier in its source, which keys the agent's text for the item; never rendered. */
    id: z.string().min(1),
    neededBy: CalendarDateSchema.nullable(),
    /** Whether the item is an open ask of the customer. */
    needsInput: z.boolean(),
    /** Where the item is recorded, usually internal; never rendered. */
    sources: z.array(z.string()),
    started: z.boolean(),
    targetOn: CalendarDateSchema.nullable(),
    title: z.string(),
    /** The `id` of the item's workstream, declared in the file's `workstreams` or not. */
    workstream: z.string().min(1).nullable(),
  })
  .refine((item) => !(item.closed && item.completed) || item.completedOn !== null, {
    message: 'a completed item requires completedOn',
    path: ['completedOn'],
  });

export type ProgressItem = z.infer<typeof ProgressItemSchema>;

/** A workstream that items name, with its health when the source states one. */
export const WorkstreamSchema = z.strictObject({
  health: HealthSchema.optional(),
  id: z.string().min(1),
  note: z.string().optional(),
  title: z.string(),
});

export type Workstream = z.infer<typeof WorkstreamSchema>;

/** The file that a source writes and `assemble` reads. */
export const ProgressItemsFileSchema = z.strictObject({
  items: z.array(ProgressItemSchema),
  workstreams: z.array(WorkstreamSchema).optional(),
});

export type ProgressItemsFile = z.infer<typeof ProgressItemsFileSchema>;

// region | Helpers

/** Returns whether `text` is a `YYYY-MM-DD` date that exists in the calendar. */
function isCalendarDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return false;
  }
  const parsed = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text;
}

// endregion | Helpers
