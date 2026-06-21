import type { MediaProbeInput, MediaProbeResult, SearchEvent } from '@shared/types'
import { getRuntimeApi } from './client'

export async function searchVod(keyword: string): Promise<{ searchId: string } | undefined> {
  const api = getRuntimeApi()
  return api ? api.vod.search(keyword) : undefined
}

export async function cancelVodSearch(searchId: string): Promise<void> {
  const api = getRuntimeApi()
  if (api) {
    await api.vod.cancelSearch(searchId)
  }
}

export async function probeMediaSource(input: MediaProbeInput): Promise<MediaProbeResult | undefined> {
  const api = getRuntimeApi()
  return api?.vod.probeMedia(input)
}

export function onVodSearchEvent(listener: (event: SearchEvent) => void): () => void {
  const api = getRuntimeApi()
  return api ? api.vod.onSearchEvent(listener) : () => {}
}
