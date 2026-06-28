import { useEffect, useRef, useState, type RefObject } from 'react'
import type Player from 'video.js/dist/types/player'
import type { HlsSessionStats, PlayerStatsSnapshot } from '../player/types'
import {
  formatBitrate,
  formatBufferSeconds,
  formatBytes,
  formatLatencySeconds,
  formatPlaybackUrlForDisplay,
  formatResolution,
  formatStatsTimestamp,
} from '../player/player-stats-utils'

const STATS_REFRESH_MS = 500

interface UseVideoJsStatsOptions {
  enabled: boolean
  hlsSessionStats: HlsSessionStats
  playerRef: RefObject<Player | null>
  src: string
}

export function useVideoJsStats({
  enabled,
  hlsSessionStats,
  playerRef,
  src,
}: UseVideoJsStatsOptions): PlayerStatsSnapshot {
  const hlsSessionStatsRef = useRef(hlsSessionStats)
  useEffect(() => {
    hlsSessionStatsRef.current = hlsSessionStats
  }, [hlsSessionStats])

  const [snapshot, setSnapshot] = useState<PlayerStatsSnapshot>(() =>
    buildSnapshot({ hlsSessionStats, playerRef, src }),
  )

  useEffect(() => {
    if (!enabled) {
      return
    }

    const refresh = (): void => {
      setSnapshot((current) => {
        const next = buildSnapshot({ hlsSessionStats: hlsSessionStatsRef.current, playerRef, src })
        return isSameSnapshot(current, next) ? current : next
      })
    }

    refresh()
    const timer = window.setInterval(refresh, STATS_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [enabled, playerRef, src])

  return snapshot
}

function buildSnapshot({
  hlsSessionStats,
  playerRef,
  src,
}: {
  hlsSessionStats: HlsSessionStats
  playerRef: RefObject<Player | null>
  src: string
}): PlayerStatsSnapshot {
  const player = playerRef.current
  const video = player?.el()?.querySelector('video') ?? null
  const playerElement = player?.el()
  const viewportWidth = playerElement?.clientWidth ?? 0
  const viewportHeight = playerElement?.clientHeight ?? 0
  const videoWidth = video?.videoWidth ?? 0
  const videoHeight = video?.videoHeight ?? 0
  const currentTime = player?.currentTime() ?? 0
  const duration = player?.duration() ?? 0
  const qualityLevels = getQualityLevels(player)
  const selectedQuality = getSelectedQuality(qualityLevels)
  const optimalQuality = getOptimalQuality(qualityLevels, videoWidth, videoHeight)
  const playbackQuality = typeof video?.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality() : null
  const droppedFrames = playbackQuality?.droppedVideoFrames ?? 0
  const totalFrames = playbackQuality?.totalVideoFrames ?? 0
  const bufferedEnd = getBufferedEnd(player)
  const live = !(Number.isFinite(duration) && duration > 0)
  const liveLatency =
    live && Number.isFinite(duration) && duration > 0 ? formatLatencySeconds(Math.max(0, duration - currentTime)) : null
  const bufferHealth = Number.isFinite(duration) && duration > 0 ? bufferedEnd - currentTime : bufferedEnd
  const videoCodec = selectedQuality?.codecs ?? null
  const audioCodec = hlsSessionStats.audioCodec

  return {
    viewport: viewportWidth > 0 && viewportHeight > 0 ? `${viewportWidth}×${viewportHeight}` : '—',
    frames:
      totalFrames > 0
        ? `${droppedFrames} dropped / ${totalFrames} total`
        : playbackQuality
          ? '0 dropped / 0 total'
          : '—',
    currentResolution: formatResolution(selectedQuality?.width ?? videoWidth, selectedQuality?.height ?? videoHeight),
    optimalResolution: formatResolution(optimalQuality.width, optimalQuality.height),
    bitrate: formatBitrate(selectedQuality?.bitrate ?? null),
    connectionSpeed: formatBitrate(hlsSessionStats.bandwidthEstimate),
    bufferHealth: formatBufferSeconds(bufferHealth),
    networkActivity: formatBytes(hlsSessionStats.networkBytesLoaded),
    codecs: videoCodec || audioCodec ? [videoCodec ?? '—', audioCodec ?? '—'].join(' / ') : '—',
    streamType: live ? '直播' : '点播',
    liveLatency,
    src: formatPlaybackUrlForDisplay(src),
    timestamp: formatStatsTimestamp(new Date()),
  }
}

function isSameSnapshot(left: PlayerStatsSnapshot, right: PlayerStatsSnapshot): boolean {
  return (
    left.viewport === right.viewport &&
    left.frames === right.frames &&
    left.currentResolution === right.currentResolution &&
    left.optimalResolution === right.optimalResolution &&
    left.bitrate === right.bitrate &&
    left.connectionSpeed === right.connectionSpeed &&
    left.bufferHealth === right.bufferHealth &&
    left.networkActivity === right.networkActivity &&
    left.codecs === right.codecs &&
    left.streamType === right.streamType &&
    left.liveLatency === right.liveLatency &&
    left.src === right.src
  )
}

interface QualityLevelLike {
  bitrate?: number
  codecs?: string
  height?: number
  width?: number
}

function getQualityLevels(player: Player | null): QualityLevelLike[] {
  const context = player ? getPlayerHlsLevels(player) : null
  return context ?? []
}

function getPlayerHlsLevels(player: Player): QualityLevelLike[] | null {
  const hls = (player as Player & { vfanHlsLevels?: QualityLevelLike[] }).vfanHlsLevels
  return hls ?? null
}

function getSelectedQuality(qualityLevels: QualityLevelLike[]): QualityLevelLike | null {
  return qualityLevels[0] ?? null
}

function getOptimalQuality(
  qualityLevels: QualityLevelLike[],
  fallbackWidth: number,
  fallbackHeight: number,
): { width: number; height: number } {
  if (qualityLevels.length === 0) {
    return { width: fallbackWidth, height: fallbackHeight }
  }

  let best = qualityLevels[0]
  for (let index = 1; index < qualityLevels.length; index += 1) {
    const item = qualityLevels[index]
    if (
      (item.height ?? 0) > (best.height ?? 0) ||
      (item.height === best.height && (item.width ?? 0) > (best.width ?? 0))
    ) {
      best = item
    }
  }

  return { width: best.width ?? fallbackWidth, height: best.height ?? fallbackHeight }
}

function getBufferedEnd(player: Player | null): number {
  if (!player) {
    return 0
  }

  const buffered = player.buffered()
  if (buffered.length === 0) {
    return 0
  }

  return buffered.end(buffered.length - 1)
}
