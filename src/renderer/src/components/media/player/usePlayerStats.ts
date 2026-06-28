import { useEffect, useState, type RefObject } from 'react'
import { useMediaState, type MediaPlayerInstance, type VideoQuality } from '@vidstack/react'
import type { HlsSessionStats, PlayerStatsSnapshot } from './types'
import {
  formatBitrate,
  formatBufferSeconds,
  formatBytes,
  formatLatencySeconds,
  formatPlaybackUrlForDisplay,
  formatResolution,
  formatStatsTimestamp,
} from './player-stats-utils'

function getPlayerVideoElement(player: MediaPlayerInstance | null | undefined): HTMLVideoElement | null {
  if (!player?.el) {
    return null
  }

  return player.el.querySelector('video')
}

const STATS_REFRESH_MS = 500

interface UsePlayerStatsOptions {
  playerRef: RefObject<MediaPlayerInstance | null>
  src: string
  hlsSessionStats: HlsSessionStats
}

export function usePlayerStats({ playerRef, src, hlsSessionStats }: UsePlayerStatsOptions): PlayerStatsSnapshot {
  const quality = useMediaState('quality')
  const qualities = useMediaState('qualities')
  const live = useMediaState('live')
  const bufferedWindow = useMediaState('bufferedWindow')
  const liveEdgeStart = useMediaState('liveEdgeStart')
  const currentTime = useMediaState('currentTime')
  const [snapshot, setSnapshot] = useState<PlayerStatsSnapshot>(() =>
    buildSnapshot({
      playerRef,
      src,
      hlsSessionStats,
      quality,
      qualities,
      live,
      bufferedWindow,
      liveEdgeStart,
      currentTime,
    }),
  )

  useEffect(() => {
    const refresh = (): void => {
      setSnapshot(
        buildSnapshot({
          playerRef,
          src,
          hlsSessionStats,
          quality,
          qualities,
          live,
          bufferedWindow,
          liveEdgeStart,
          currentTime,
        }),
      )
    }

    refresh()
    const timer = window.setInterval(refresh, STATS_REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [bufferedWindow, currentTime, hlsSessionStats, live, liveEdgeStart, playerRef, qualities, quality, src])

  return snapshot
}

function buildSnapshot({
  playerRef,
  src,
  hlsSessionStats,
  quality,
  qualities,
  live,
  bufferedWindow,
  liveEdgeStart,
  currentTime,
}: {
  playerRef: RefObject<MediaPlayerInstance | null>
  src: string
  hlsSessionStats: HlsSessionStats
  quality: VideoQuality | null
  qualities: VideoQuality[]
  live: boolean
  bufferedWindow: number
  liveEdgeStart: number
  currentTime: number
}): PlayerStatsSnapshot {
  const player = playerRef.current
  const video = getPlayerVideoElement(player)
  const playerElement = player?.el
  const viewportWidth = playerElement?.clientWidth ?? 0
  const viewportHeight = playerElement?.clientHeight ?? 0
  const videoWidth = quality?.width || video?.videoWidth || 0
  const videoHeight = quality?.height || video?.videoHeight || 0
  const optimalQuality = getOptimalQuality(qualities, videoWidth, videoHeight)
  const playbackQuality = typeof video?.getVideoPlaybackQuality === 'function' ? video.getVideoPlaybackQuality() : null
  const droppedFrames = playbackQuality?.droppedVideoFrames ?? 0
  const totalFrames = playbackQuality?.totalVideoFrames ?? 0
  const frames =
    totalFrames > 0 ? `${droppedFrames} dropped / ${totalFrames} total` : playbackQuality ? '0 dropped / 0 total' : '—'
  const videoCodec = quality?.codec ?? null
  const audioCodec = hlsSessionStats.audioCodec
  const codecs = videoCodec || audioCodec ? [videoCodec ?? '—', audioCodec ?? '—'].join(' / ') : '—'
  const liveLatency =
    live && Number.isFinite(liveEdgeStart) && Number.isFinite(currentTime)
      ? formatLatencySeconds(Math.max(0, liveEdgeStart - currentTime))
      : null

  return {
    viewport: viewportWidth > 0 && viewportHeight > 0 ? `${viewportWidth}×${viewportHeight}` : '—',
    frames,
    currentResolution: formatResolution(videoWidth, videoHeight),
    optimalResolution: formatResolution(optimalQuality.width, optimalQuality.height),
    bitrate: formatBitrate(quality?.bitrate ?? null),
    connectionSpeed: formatBitrate(hlsSessionStats.bandwidthEstimate),
    bufferHealth: formatBufferSeconds(bufferedWindow),
    networkActivity: formatBytes(hlsSessionStats.networkBytesLoaded),
    codecs,
    streamType: live ? '直播' : '点播',
    liveLatency,
    src: formatPlaybackUrlForDisplay(src),
    timestamp: formatStatsTimestamp(new Date()),
  }
}

function getOptimalQuality(
  qualities: VideoQuality[],
  fallbackWidth: number,
  fallbackHeight: number,
): { width: number; height: number } {
  if (qualities.length === 0) {
    return { width: fallbackWidth, height: fallbackHeight }
  }

  const best = qualities.reduce((current, item) => {
    if (item.height > current.height) {
      return item
    }

    if (item.height === current.height && item.width > current.width) {
      return item
    }

    return current
  }, qualities[0])

  return { width: best.width, height: best.height }
}
