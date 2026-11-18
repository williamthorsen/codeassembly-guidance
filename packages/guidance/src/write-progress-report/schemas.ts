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

/** The status that `assemble` assigns to an item that the report shows. */
export const ProgressStatusSchema = z.enum(['done', 'in-progress', 'needs-input', 'planned']);

/** The fields of an `assemble` result that `render` reads, whatever else the result contains. */
export const AssembledResultSchema = z.object({
  lastUpdated: CalendarDateSchema,
  ok: z.literal(true),
  period: z.strictObject({ end: CalendarDateSchema, start: CalendarDateSchema }).nullable(),
  sections: z.array(
    z.object({
      rows: z.array(
        z.object({
          date: z.string(),
          dateOn: CalendarDateSchema.nullable(),
          id: z.string(),
          label: z.string(),
          status: ProgressStatusSchema,
        }),
      ),
      workstream: WorkstreamSchema.nullable(),
    }),
  ),
});

export type AssembledResult = z.infer<typeof AssembledResultSchema>;

/** The agent's text for one row, keyed by the item's `id`. */
export const RowTextSchema = z.strictObject({
  /** Markdown of one or more paragraphs or a list, with links attached to words. */
  details: z.string(),
  id: z.string().min(1),
  workItem: z.string().min(1),
});

/** The agent's text for one section, keyed by its workstream's `id`, or null for the items without a workstream. */
export const SectionTextSchema = z.strictObject({
  heading: z.string().min(1),
  /** Required unless the source declares the workstream's health, and then equal to it. */
  health: HealthSchema.optional(),
  note: z.string().optional(),
  rows: z.array(RowTextSchema),
  workstream: z.string().min(1).nullable(),
});

/** The file of customer-facing text that the agent writes and `render` merges with the assembled report. */
export const ReportTextFileSchema = z.strictObject({ sections: z.array(SectionTextSchema) });

export type ReportTextFile = z.infer<typeof ReportTextFileSchema>;

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
