import { z } from 'zod'

export const liveSourceConfigSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  url: z.string().trim().url(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

export const appSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  subscriptionUrl: z.string().trim().default(''),
  liveSources: z.array(liveSourceConfigSchema).default([]),
})
