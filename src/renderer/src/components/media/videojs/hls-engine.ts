import Hls, { type ErrorData, type FragLoadedData } from 'hls.js'
import type Player from 'video.js/dist/types/player'
import { createFilteredHlsLoader } from '@renderer/lib/hls-playlist-filter'
import type { HlsSessionStats } from '../player/types'

export interface AttachHlsOptions {
  adBlockEnabled: boolean
  autoPlay: boolean
  player: Player
  src: string
  video: HTMLVideoElement
  onError: (message: string, fatal: boolean) => void
  onHlsReady: (hls: Hls) => void
  onStatsUpdate: (stats: HlsSessionStats) => void
}

export interface HlsEngineHandle {
  destroy: () => void
  hls: Hls
}

export function attachHlsEngine(options: AttachHlsOptions): HlsEngineHandle | null {
  if (!Hls.isSupported()) {
    if (options.video.canPlayType('application/vnd.apple.mpegurl')) {
      options.video.src = options.src
      if (options.autoPlay) {
        void options.video.play().catch(() => undefined)
      }
    }
    return null
  }

  let networkBytesLoaded = 0
  const hls = new Hls({
    enableWorker: true,
    loader: options.adBlockEnabled ? createFilteredHlsLoader(Hls) : Hls.DefaultConfig.loader,
  })

  const syncStats = (): void => {
    const audioTrack = hls.audioTracks?.[hls.audioTrack]
    options.onStatsUpdate({
      audioCodec: audioTrack?.audioCodec ?? null,
      autoLevelEnabled: hls.autoLevelEnabled,
      bandwidthEstimate: hls.bandwidthEstimate ?? null,
      networkBytesLoaded,
    })
  }

  const onFragLoaded = (_event: string, data: FragLoadedData): void => {
    networkBytesLoaded += data.frag?.stats?.total ?? 0
    syncStats()
  }
  const onLevelSwitched = (): void => syncStats()
  const onError = (_event: string, data: ErrorData): void => {
    const message = `${data.type}: ${data.details}${data.error?.message ? ` - ${data.error.message}` : ''}`
    options.onError(message, data.fatal)

    if (data.fatal) {
      if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
        hls.startLoad()
      } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
        hls.recoverMediaError()
      }
    }
  }

  hls.on(Hls.Events.FRAG_LOADED, onFragLoaded)
  hls.on(Hls.Events.LEVEL_SWITCHED, onLevelSwitched)
  hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, syncStats)
  hls.on(Hls.Events.ERROR, onError)
  hls.attachMedia(options.video)
  hls.loadSource(options.src)
  options.onHlsReady(hls)
  syncStats()

  return {
    hls,
    destroy: () => {
      hls.off(Hls.Events.FRAG_LOADED, onFragLoaded)
      hls.off(Hls.Events.LEVEL_SWITCHED, onLevelSwitched)
      hls.off(Hls.Events.AUDIO_TRACK_SWITCHED, syncStats)
      hls.off(Hls.Events.ERROR, onError)
      hls.destroy()
    },
  }
}

export function isHlsSource(src: string | undefined, sourceType?: 'hls'): boolean {
  if (!src) {
    return false
  }

  return sourceType === 'hls' || /\.m3u8(?:$|[?#])/i.test(src)
}

export function isPlayerSeekable(player: Player): boolean {
  const duration = player.duration()
  return duration != null && Number.isFinite(duration) && duration > 0
}
