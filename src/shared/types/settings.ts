import type { LiveSourceConfig } from './live'

export type ThemeMode = 'light' | 'dark' | 'system'

export interface AppSettings {
  theme: ThemeMode
  subscriptionUrl: string
  liveSources: LiveSourceConfig[]
}
