export interface PlayerErrorLog {
  id: number
  timestamp: number
  source: 'HLS' | 'MediaProvider'
  message: string
  fatal: boolean
}

export type ActionHint =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek-back'; seconds: number }
  | { type: 'seek-forward'; seconds: number }
  | { type: 'volume'; percent: number }

export interface KeyHoldState {
  key: string
  timer: ReturnType<typeof setTimeout> | null
  interval: ReturnType<typeof setInterval> | null
  isLongPress: boolean
}

export type PlayerVariant = 'vod' | 'live'

export interface PlayerControlsConfig {
  progress: boolean
  time: boolean
  settings: boolean
  quality: boolean
  theaterMode: boolean
  keyboardSeek: boolean
  adBlock: boolean
}

export const PLAYER_CONTROLS_PRESETS: Record<PlayerVariant, PlayerControlsConfig> = {
  vod: {
    progress: true,
    time: true,
    settings: true,
    quality: true,
    theaterMode: true,
    keyboardSeek: true,
    adBlock: true,
  },
  live: {
    progress: false,
    time: false,
    settings: false,
    quality: true,
    theaterMode: true,
    keyboardSeek: false,
    adBlock: false,
  },
}

export interface HlsSessionStats {
  bandwidthEstimate: number | null
  networkBytesLoaded: number
  audioCodec: string | null
  autoLevelEnabled: boolean
}

export interface PlayerStatsSnapshot {
  viewport: string
  frames: string
  currentResolution: string
  optimalResolution: string
  bitrate: string
  connectionSpeed: string
  bufferHealth: string
  networkActivity: string
  codecs: string
  streamType: string
  liveLatency: string | null
  src: string
  timestamp: string
}

export interface PlayerNavigationLabels {
  previous: string
  next: string
}
