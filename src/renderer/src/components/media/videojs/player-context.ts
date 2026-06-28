import type Player from 'video.js/dist/types/player'
import type Hls from 'hls.js'
import type { PlayerControlsConfig, PlayerNavigationLabels } from '../player/types'

export interface VfanPlayerContext {
  controls: PlayerControlsConfig
  hasNextEpisode: boolean
  hasPreviousEpisode: boolean
  hls: Hls | null
  keyboardSeek: boolean
  loopEnabled: boolean
  navigationLabels?: PlayerNavigationLabels
  playlistFilteringEnabled: boolean
  seekStepSeconds: number
  onNextEpisode?: () => void
  onPreviousEpisode?: () => void
  onRetry?: () => void
  onShowErrorLogs?: () => void
  onToggleSettings?: () => void
  onToggleLoop?: () => void
  onTogglePlaylistFiltering?: () => void
  onToggleStats?: () => void
  onToggleTheaterMode?: () => void
}

const contextMap = new WeakMap<Player, VfanPlayerContext>()

export function setVfanContext(player: Player, context: VfanPlayerContext): void {
  contextMap.set(player, context)
}

export function getVfanContext(player: Player): VfanPlayerContext | undefined {
  return contextMap.get(player)
}

export function updateVfanContext(player: Player, partial: Partial<VfanPlayerContext>): void {
  const current = contextMap.get(player)
  if (!current) {
    return
  }

  contextMap.set(player, { ...current, ...partial })
}
