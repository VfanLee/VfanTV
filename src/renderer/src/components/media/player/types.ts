export interface PlayerErrorLog {
  id: number
  timestamp: number
  source: 'HLS' | 'MediaProvider'
  message: string
  fatal: boolean
}

export type PlayerVariant = 'vod' | 'live'

export interface PlayerControlsConfig {
  progress: boolean
  time: boolean
  settings: boolean
  keyboardSeek: boolean
  loopToggle: boolean
  episodeNav: boolean
}

export const PLAYER_CONTROLS_PRESETS: Record<PlayerVariant, PlayerControlsConfig> = {
  vod: {
    progress: true,
    time: true,
    settings: true,
    keyboardSeek: true,
    loopToggle: false,
    episodeNav: true,
  },
  live: {
    progress: false,
    time: false,
    settings: false,
    keyboardSeek: false,
    loopToggle: true,
    episodeNav: false,
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
