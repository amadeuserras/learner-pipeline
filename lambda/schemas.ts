import { z } from 'zod';

const nonEmptyString = z.string().trim().min(1);

export const LearnerEventSchema = z.object({
  id: nonEmptyString,
  learnerId: nonEmptyString,
  topic: nonEmptyString,
  lesson: nonEmptyString,
  score: z.number().min(0).max(100),
  submittedAt: z.iso.datetime({ offset: true }),
});
export type LearnerEvent = z.infer<typeof LearnerEventSchema>;

export const StatsSchema = z.object({
  avgScore: z.number(),
  bestScore: z.number(),
  count: z.number(),
});
export type Stats = z.infer<typeof StatsSchema>;

export const ProgressRequestSchema = z.object({
  learnerId: nonEmptyString,
  topic: nonEmptyString.optional(),
});
export type ProgressRequest = z.infer<typeof ProgressRequestSchema>;

export type ProgressResponse = Stats & { learnerId: string; topic?: string };
