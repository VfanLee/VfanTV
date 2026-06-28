import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  MediaPlayer,
  MediaProvider,
  isHLSProvider,
  type MediaErrorDetail,
  type MediaPlayerInstance,
  type PlayerSrc,
} from '@vidstack/react'
import Hls from 'hls.js'
import { cn } from '@renderer/lib/utils'
import { createFilteredHlsLoader } from '@renderer/lib/hls-playlist-filter'
import { PlayerChrome } from './player/PlayerChrome'
import {
  PLAYER_CONTROLS_PRESETS,
  type HlsSessionStats,
  type PlayerErrorLog,
  type PlayerNavigationLabels,
  type PlayerVariant,
} from './player/types'

const MAX_ERROR_LOGS = 100
const HLS_MIME_TYPE = 'application/x-mpegurl' as const
const HLS_PLAYLIST_FILTER_STORAGE_KEY = 'enable_blockad'
const PLAYER_VOLUME_STORAGE_KEY = 'vfan-player-volume'
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
  onNextEpisode,
  onEnded,
  onPreviousEpisode,
  onProgress,
  onToggleTheaterMode,
  src,
  sourceType,
  title,
  variant = 'vod',
}: BasicPlayerProps): React.JSX.Element {
  const playerRef = useRef<MediaPlayerInstance | null>(null)
  const errorLogIdRef = useRef(0)
  const retryTimeRef = useRef(0)
  const resumeAfterReloadRef = useRef(false)
  const appliedLoadKeyRef = useRef('')
  const hlsDisposeRef = useRef<(() => void) | null>(null)
  const networkBytesRef = useRef(0)
  const [reloadNonce, setReloadNonce] = useState(0)
  const controls = PLAYER_CONTROLS_PRESETS[variant]
  const [playlistFilteringEnabled, setPlaylistFilteringEnabled] = useState(() => readPlaylistFilteringEnabled())
  const [hlsSessionStats, setHlsSessionStats] = useState<HlsSessionStats>(EMPTY_HLS_SESSION_STATS)
  const [playbackSettings, setPlaybackSettings] = useState(() => ({
    playbackRate: 1,
    volume: readStoredPlayerVolume(),
    muted: false,
  }))
  const [errorState, setErrorState] = useState<{ src: string | undefined; logs: PlayerErrorLog[] }>({
    src,
    logs: [],
  })
  const playerSrc = useMemo<PlayerSrc | undefined>(() => getPlayerSource(src, sourceType), [sourceType, src])
  const errorLogs = errorState.src === src ? errorState.logs : []
  const loadKey = `${src ?? ''}:${reloadNonce}`
  const adBlockEnabled = controls.adBlock && playlistFilteringEnabled

  useEffect(() => {
    networkBytesRef.current = 0
    setHlsSessionStats(EMPTY_HLS_SESSION_STATS)
    hlsDisposeRef.current?.()
    hlsDisposeRef.current = null
  }, [loadKey])

  useEffect(() => {
    return () => {
      hlsDisposeRef.current?.()
      hlsDisposeRef.current = null
    }
  }, [])

  const appendErrorLog = useCallback(
    (source: PlayerErrorLog['source'], message: string, fatal: boolean): void => {
      errorLogIdRef.current += 1
      const nextLog: PlayerErrorLog = {
        id: errorLogIdRef.current,
        timestamp: Date.now(),
        source,
        message,
        fatal,
      }

      setErrorState((current) => {
        const currentLogs = current.src === src ? current.logs : []
        return { src, logs: [...currentLogs.slice(-(MAX_ERROR_LOGS - 1)), nextLog] }
      })
    },
    [src],
  )

  const retryPlayback = (): void => {
    retryTimeRef.current = playerRef.current?.currentTime ?? 0
    appliedLoadKeyRef.current = ''
    setReloadNonce((current) => current + 1)
  }

  const togglePlaylistFiltering = useCallback((): void => {
    if (!controls.adBlock) {
      return
    }

    const nextEnabled = !playlistFilteringEnabled
    window.localStorage.setItem(HLS_PLAYLIST_FILTER_STORAGE_KEY, String(nextEnabled))

    if (isHlsSource(src)) {
      retryTimeRef.current = playerRef.current?.currentTime ?? 0
      resumeAfterReloadRef.current = true
      appliedLoadKeyRef.current = ''
      setReloadNonce((current) => current + 1)
    }

    setPlaylistFilteringEnabled(nextEnabled)
  }, [controls.adBlock, playlistFilteringEnabled, src])

  const handlePlaybackRateChange = useCallback((playbackRate: number): void => {
    setPlaybackSettings((current) => ({ ...current, playbackRate }))
  }, [])

  const syncHlsSessionStats = useCallback((hls: Hls): void => {
    const audioTrack = hls.audioTracks?.[hls.audioTrack]
    setHlsSessionStats({
      audioCodec: audioTrack?.audioCodec ?? null,
      autoLevelEnabled: hls.autoLevelEnabled,
      bandwidthEstimate: hls.bandwidthEstimate ?? null,
      networkBytesLoaded: networkBytesRef.current,
    })
  }, [])

  const applyStartTime = (duration: number): void => {
    const player = playerRef.current
    if (!player || appliedLoadKeyRef.current === loadKey || !Number.isFinite(duration) || duration <= 0) {
      return
    }

    const requestedTime = retryTimeRef.current > 0 ? retryTimeRef.current : initialTime
    if (requestedTime > 0 && requestedTime < duration) {
      player.currentTime = requestedTime
    }

    retryTimeRef.current = 0
    appliedLoadKeyRef.current = loadKey

    if (resumeAfterReloadRef.current) {
      resumeAfterReloadRef.current = false
      void player.play()
    }
  }

  const reportProgress = (currentTime: number, duration: number): void => {
    onProgress?.({
      currentTime: Math.floor(currentTime),
      duration: Number.isFinite(duration) ? Math.floor(duration) : 0,
    })
  }

  const reportMediaError = (detail: MediaErrorDetail): void => {
    appendErrorLog(
      'MediaProvider',
      detail.message || (detail.code ? `媒体加载失败，错误代码 ${detail.code}` : '播放器加载失败'),
      true,
    )
  }

  const chromePaddingClass = isTheaterMode ? 'h-full' : controls.progress ? 'pt-14 pb-20' : 'pt-14 pb-16'

  if (!src || !playerSrc) {
    return (
      <div className={cn('relative w-full overflow-hidden bg-black', isTheaterMode && 'h-full', className)}>
        <div aria-hidden="true" className={cn('pointer-events-none w-full', chromePaddingClass)}>
          <div className={cn('w-full', isTheaterMode ? 'h-full' : 'aspect-video')} />
        </div>
        <div
          className={cn(
            'absolute inset-x-0 flex items-center justify-center text-sm text-white/55',
            isTheaterMode ? 'inset-y-0' : controls.progress ? 'top-14 bottom-20' : 'top-14 bottom-16',
          )}
        >
          请选择一个可播放剧集
        </div>
      </div>
    )
  }

  return (
    <MediaPlayer
      key={loadKey}
      ref={playerRef}
      autoPlay={autoPlay}
      className={cn(
        'group/player relative w-full overflow-hidden bg-black outline-none',
        isTheaterMode && 'h-full',
        className,
      )}
      controlsDelay={2000}
      hideControlsOnMouseLeave
      keyDisabled
      load="eager"
      logLevel="warn"
      loop={loop}
      muted={playbackSettings.muted}
      playbackRate={playbackSettings.playbackRate}
      playsInline
      preload="metadata"
      src={playerSrc}
      title={title ?? 'VfanTV 播放器'}
      volume={playbackSettings.volume}
      onCanPlay={(detail) => applyStartTime(detail.duration)}
      onEnded={() => onEnded?.()}
      onError={reportMediaError}
      onHlsError={(detail) => {
        const message = `${detail.type}: ${detail.details}${detail.error?.message ? ` - ${detail.error.message}` : ''}`
        appendErrorLog('HLS', message, detail.fatal)
      }}
      onProviderChange={(provider) => {
        hlsDisposeRef.current?.()
        hlsDisposeRef.current = null

        if (isHLSProvider(provider)) {
          provider.library = async () => {
            const hlsLibrary = await import('hls.js')
            if (adBlockEnabled) {
              provider.config = {
                ...provider.config,
                loader: createFilteredHlsLoader(hlsLibrary.default),
              }
            }
            return hlsLibrary
          }

          hlsDisposeRef.current = provider.onInstance((hls) => {
            const onFragLoaded = (_event: string, data: { frag?: { stats?: { total?: number } } }): void => {
              networkBytesRef.current += data.frag?.stats?.total ?? 0
              syncHlsSessionStats(hls)
            }
            const onLevelSwitched = (): void => {
              syncHlsSessionStats(hls)
            }

            hls.on(Hls.Events.FRAG_LOADED, onFragLoaded)
            hls.on(Hls.Events.LEVEL_SWITCHED, onLevelSwitched)
            syncHlsSessionStats(hls)

            return () => {
              hls.off(Hls.Events.FRAG_LOADED, onFragLoaded)
              hls.off(Hls.Events.LEVEL_SWITCHED, onLevelSwitched)
            }
          })
        }
      }}
      onRateChange={(playbackRate) => {
        setPlaybackSettings((current) => ({ ...current, playbackRate }))
      }}
      onTimeUpdate={(detail) => reportProgress(detail.currentTime, playerRef.current?.duration ?? 0)}
      onVolumeChange={(detail) => {
        window.localStorage.setItem(PLAYER_VOLUME_STORAGE_KEY, String(detail.volume))
        setPlaybackSettings((current) => ({
          ...current,
          muted: detail.muted,
          volume: detail.volume,
        }))
      }}
    >
      <div aria-hidden="true" className={cn('pointer-events-none w-full', chromePaddingClass)}>
        <div className={cn('w-full', isTheaterMode ? 'h-full' : 'aspect-video')} />
      </div>
      <MediaProvider
        className={cn(
          'pointer-events-none absolute inset-x-0 bg-black [&>video]:h-full [&>video]:w-full [&>video]:object-contain',
          isTheaterMode ? 'inset-y-0' : controls.progress ? 'top-14 bottom-20' : 'top-14 bottom-16',
        )}
      />
      <PlayerChrome
        controls={controls}
        errorLogs={errorLogs}
        hasNextEpisode={hasNextEpisode}
        hasPreviousEpisode={hasPreviousEpisode}
        hlsSessionStats={hlsSessionStats}
        isTheaterMode={isTheaterMode}
        navigationLabels={navigationLabels}
        playlistFilteringEnabled={playlistFilteringEnabled}
        playerRef={playerRef}
        src={src}
        title={title}
        variant={variant}
        onNextEpisode={onNextEpisode}
        onPlaybackRateChange={handlePlaybackRateChange}
        onPreviousEpisode={onPreviousEpisode}
        onRetry={retryPlayback}
        onToggleTheaterMode={onToggleTheaterMode}
        onTogglePlaylistFiltering={togglePlaylistFiltering}
      />
    </MediaPlayer>
  )
}

function isHlsSource(src: string | undefined): boolean {
  if (!src) {
    return false
  }

  if (/\.m3u8(?:$|[?#])/i.test(src)) {
    return true
  }

  return false
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

function getPlayerSource(src: string | undefined, sourceType: BasicPlayerProps['sourceType']): PlayerSrc | undefined {
  if (!src) {
    return undefined
  }

  if (sourceType === 'hls' || isHlsSource(src)) {
    return { src, type: HLS_MIME_TYPE }
  }

  return src
}
