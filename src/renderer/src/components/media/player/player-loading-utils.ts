import type { PlayerVariant } from './types'

export interface PlayerLoadingState {
  canLoad: boolean
  canPlay: boolean
  paused: boolean
  seeking: boolean
  started: boolean
  waiting: boolean
}

export interface PlayerLoadingOptions {
  variant?: PlayerVariant
}

export function isPlayerLoadingOverlayVisible(state: PlayerLoadingState): boolean {
  if (state.seeking) {
    return true
  }

  return state.canLoad && (!state.canPlay || state.waiting)
}

export function resolvePlayerLoadingMessage(state: PlayerLoadingState, options: PlayerLoadingOptions = {}): string {
  const { canPlay, paused, seeking, started, waiting } = state
  const { variant = 'vod' } = options

  if (seeking) {
    return '加载中...'
  }

  if (variant === 'live') {
    return '正在连接直播...'
  }

  if (waiting && started) {
    return '缓冲中...'
  }

  if (!canPlay && !paused) {
    return '正在启动播放...'
  }

  if (!canPlay) {
    return '正在加载...'
  }

  if (waiting) {
    return '缓冲中...'
  }

  return '加载中...'
}
