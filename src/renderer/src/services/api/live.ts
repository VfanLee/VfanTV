import type { LivePlaylist, LiveStreamProbeResult } from '@shared/types'
import { requireRuntimeApi } from './client'

export async function loadLivePlaylist(url: string): Promise<LivePlaylist> {
  return requireRuntimeApi().live.loadPlaylist(url)
}

export async function probeLiveStream(url: string): Promise<LiveStreamProbeResult> {
  return requireRuntimeApi().live.probeStream(url)
}
