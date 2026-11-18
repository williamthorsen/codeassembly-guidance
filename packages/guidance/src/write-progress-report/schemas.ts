import { z } from 'zod';

/** Matches a `YYYY-MM-DD` string that names a real calendar date. */
export const CalendarDateSchema = z.string().refine(isCalendarDate, { message: 'expected a YYYY-MM-DD calendar date' });

/** One work item in the normalized shape that every source supplies: facts about the item, never a status. */
export const ProgressItemSchema = z.strictObject({
  closed: z.boolean(),
  /** Whether the item was closed as completed; ignored for an open item. */
  completed: z.boolean(),
  completedOn: CalendarDateSchema.nullable(),
  /** Context for rewording the item as an outcome; never shown as is. */
  description: z.string().nullable(),
  expectedOn: CalendarDateSchema.nullable(),
  /** The item's identifier in its tracker; the sort's last key, and never shown unless bound guidance asks for it. */
  id: z.string().min(1),
  started: z.boolean(),
  title: z.string(),
  url: z.string().nullable(),
});

export type ProgressItem = z.infer<typeof ProgressItemSchema>;

/** The file that a source writes and `assemble` reads. */
export const ProgressItemsFileSchema = z.strictObject({ items: z.array(ProgressItemSchema) });

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
