import { useCallback, useMemo, useRef, useState } from 'react'
import { cn } from '@renderer/lib/utils'
import {
  PLAYER_CONTROLS_PRESETS,
  type HlsSessionStats,
  type PlayerControlsConfig,
  type PlayerErrorLog,
  type PlayerNavigationLabels,
  type PlayerVariant,
} from './player/types'
import { isHlsSource } from './videojs/hls-engine'
import { PLAYER_VOLUME_STORAGE_KEY, VideoJsPlayer, type VideoJsPlayerHandle } from './videojs/VideoJsPlayer'

const MAX_ERROR_LOGS = 100
const HLS_PLAYLIST_FILTER_STORAGE_KEY = 'enable_blockad'
const PLAYER_LOOP_STORAGE_KEY = 'vfan-live-player-loop'
const DEFAULT_PLAYER_VOLUME = 0.8
const EMPTY_HLS_SESSION_STATS: HlsSessionStats = {
  audioCodec: null,
  autoLevelEnabled: true,
  bandwidthEstimate: null,
  networkBytesLoaded: 0,
}

export interface BasicPlayerProps {
  autoPlay?: boolean
  className?: string
  src?: string
  sourceType?: 'hls'
  title?: string
  initialTime?: number
  hasNextEpisode?: boolean
  hasPreviousEpisode?: boolean
  isTheaterMode?: boolean
  loop?: boolean
  navigationLabels?: PlayerNavigationLabels
  onNextEpisode?: () => void
  onEnded?: () => void
  onPreviousEpisode?: () => void
  onProgress?: (progress: { currentTime: number; duration: number }) => void
  onToggleTheaterMode?: () => void
  seekable?: boolean | 'auto'
  variant?: PlayerVariant
}

export function BasicPlayer({
  autoPlay = false,
  className,
  hasNextEpisode = false,
  hasPreviousEpisode = false,
  initialTime = 0,
  isTheaterMode = false,
  loop = false,
  navigationLabels,
  onEnded,
  onNextEpisode,
  onPreviousEpisode,
  onProgress,
  onToggleTheaterMode,
  seekable,
  sourceType,
  src,
  title,
  variant = 'vod',
}: BasicPlayerProps): React.JSX.Element {
  const playerRef = useRef<VideoJsPlayerHandle | null>(null)
  const errorLogIdRef = useRef(0)
  const [reloadState, setReloadState] = useState({ nonce: 0, retryTime: 0 })
  const [runtimeSeekable, setRuntimeSeekable] = useState<boolean | null>(null)
  const resolvedSeekable =
    seekable === true
      ? true
      : seekable === 'auto'
        ? (runtimeSeekable ?? false)
        : seekable === false
          ? false
          : variant === 'vod'
  const controls = useMemo(
    () => resolvePlayerControls(PLAYER_CONTROLS_PRESETS[variant], resolvedSeekable),
    [resolvedSeekable, variant],
  )
  const [playlistFilteringEnabled, setPlaylistFilteringEnabled] = useState(() => readPlaylistFilteringEnabled())
  const [loopEnabled, setLoopEnabled] = useState(() => readStoredLoopEnabled())
  const effectiveLoop = resolvedSeekable && controls.loopToggle ? loopEnabled : loop
  const [hlsSessionStats, setHlsSessionStats] = useState<HlsSessionStats>(EMPTY_HLS_SESSION_STATS)
  const [playbackSettings, setPlaybackSettings] = useState(() => ({
    muted: false,
    playbackRate: 1,
    volume: readStoredPlayerVolume(),
  }))
  const [errorState, setErrorState] = useState<{ src: string | undefined; logs: PlayerErrorLog[] }>({
    src,
    logs: [],
  })
  const errorLogs = errorState.src === src ? errorState.logs : []
  const loadKey = `${src ?? ''}:${reloadState.nonce}`
  const adBlockEnabled = variant === 'vod' && playlistFilteringEnabled

  const appendErrorLog = useCallback(
    (source: PlayerErrorLog['source'], message: string, fatal: boolean): void => {
      errorLogIdRef.current += 1
      const nextLog: PlayerErrorLog = {
        id: errorLogIdRef.current,
        fatal,
        message,
        source,
        timestamp: Date.now(),
      }

      setErrorState((current) => {
        const currentLogs = current.src === src ? current.logs : []
        return { src, logs: [...currentLogs.slice(-(MAX_ERROR_LOGS - 1)), nextLog] }
      })
    },
    [src],
  )

  const retryPlayback = useCallback((): void => {
    setReloadState((current) => ({
      nonce: current.nonce + 1,
      retryTime: playerRef.current?.getCurrentTime() ?? 0,
    }))
    setHlsSessionStats(EMPTY_HLS_SESSION_STATS)
  }, [])

  const togglePlaylistFiltering = useCallback((): void => {
    if (variant !== 'vod') {
      return
    }

    const nextEnabled = !playlistFilteringEnabled
    window.localStorage.setItem(HLS_PLAYLIST_FILTER_STORAGE_KEY, String(nextEnabled))
    setPlaylistFilteringEnabled(nextEnabled)

    if (isHlsSource(src, sourceType)) {
      retryPlayback()
    }
  }, [playlistFilteringEnabled, retryPlayback, sourceType, src, variant])

  const toggleLoop = useCallback((): void => {
    setLoopEnabled((current) => {
      const nextEnabled = !current
      window.localStorage.setItem(PLAYER_LOOP_STORAGE_KEY, String(nextEnabled))
      return nextEnabled
    })
  }, [])

  const syncRuntimeSeekable = useCallback(
    (nextSeekable: boolean): void => {
      if (seekable === 'auto') {
        setRuntimeSeekable(nextSeekable)
      }
    },
    [seekable],
  )

  if (!src) {
    return (
      <div className={cn('relative w-full overflow-hidden bg-black', isTheaterMode && 'h-full', className)}>
        <div
          className={cn(
            'flex aspect-video w-full items-center justify-center text-sm text-white/55',
            isTheaterMode && 'h-full',
          )}
        >
          请选择一个可播放剧集
        </div>
      </div>
    )
  }

  return (
    <VideoJsPlayer
      key={`${loadKey}:${isTheaterMode ? 'theater' : 'normal'}`}
      ref={playerRef}
      adBlockEnabled={adBlockEnabled}
      autoPlay={autoPlay}
      className={cn(isTheaterMode && 'h-full', className)}
      controls={controls}
      errorLogs={errorLogs}
      hasNextEpisode={hasNextEpisode}
      hasPreviousEpisode={hasPreviousEpisode}
      hlsSessionStats={hlsSessionStats}
      initialTime={initialTime}
      isTheaterMode={isTheaterMode}
      loadKey={loadKey}
      loop={effectiveLoop}
      loopEnabled={loopEnabled}
      muted={playbackSettings.muted}
      navigationLabels={navigationLabels}
      playbackRate={playbackSettings.playbackRate}
      playlistFilteringEnabled={playlistFilteringEnabled}
      retryTime={reloadState.retryTime}
      seekableMode={seekable}
      sourceType={sourceType}
      src={src}
      title={title}
      variant={variant}
      volume={playbackSettings.volume}
      onEnded={onEnded}
      onHlsError={(message, fatal) => appendErrorLog('HLS', message, fatal)}
      onMediaError={(message) => appendErrorLog('MediaProvider', message, true)}
      onNextEpisode={onNextEpisode}
      onPreviousEpisode={onPreviousEpisode}
      onProgress={onProgress}
      onRetry={retryPlayback}
      onSeekableChange={syncRuntimeSeekable}
      onStatsUpdate={setHlsSessionStats}
      onToggleLoop={toggleLoop}
      onTogglePlaylistFiltering={togglePlaylistFiltering}
      onToggleTheaterMode={onToggleTheaterMode}
      onPlaybackRateChange={(playbackRate) => {
        setPlaybackSettings((current) => ({ ...current, playbackRate }))
      }}
      onVolumeChange={(volume, muted) => {
        window.localStorage.setItem(PLAYER_VOLUME_STORAGE_KEY, String(volume))
        setPlaybackSettings((current) => ({ ...current, muted, volume }))
      }}
    />
  )
}

function readPlaylistFilteringEnabled(): boolean {
  return window.localStorage.getItem(HLS_PLAYLIST_FILTER_STORAGE_KEY) !== 'false'
}

function readStoredPlayerVolume(): number {
  const storedVolume = window.localStorage.getItem(PLAYER_VOLUME_STORAGE_KEY)
  if (storedVolume === null) {
    return DEFAULT_PLAYER_VOLUME
  }

  const volume = Number(storedVolume)
  return Number.isFinite(volume) && volume >= 0 && volume <= 1 ? volume : DEFAULT_PLAYER_VOLUME
}

function readStoredLoopEnabled(): boolean {
  return window.localStorage.getItem(PLAYER_LOOP_STORAGE_KEY) === 'true'
}

function resolvePlayerControls(base: PlayerControlsConfig, seekable: boolean): PlayerControlsConfig {
  if (!seekable) {
    return {
      ...base,
      loopToggle: false,
    }
  }

  return {
    ...base,
    keyboardSeek: true,
    progress: true,
    settings: base.settings,
    time: true,
  }
}
