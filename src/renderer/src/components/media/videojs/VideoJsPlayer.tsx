import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type MutableRefObject } from 'react'
import Hls from 'hls.js'
import videojs from 'video.js'
import type Player from 'video.js/dist/types/player'
import 'video.js/dist/video-js.css'
import '@videojs/themes/dist/fantasy/index.css'
import 'videojs-seek-buttons'
import 'videojs-seek-buttons/dist/videojs-seek-buttons.css'
import { cn } from '@renderer/lib/utils'
import type {
  HlsSessionStats,
  PlayerControlsConfig,
  PlayerErrorLog,
  PlayerNavigationLabels,
  PlayerVariant,
} from '../player/types'
import { attachHlsEngine, isHlsSource, isPlayerSeekable, type HlsEngineHandle } from './hls-engine'
import { createHotkeysHandler } from './hotkeys'
import { PlayerOverlays } from './PlayerOverlays'
import { setVfanContext, updateVfanContext, type VfanPlayerContext } from './player-context'
import { registerVfanComponents, updateControlBar } from './register-components'
import './vjs-theme.css'

export const PLAYER_VOLUME_STORAGE_KEY = 'vfan-player-volume'

const PLAYBACK_RATES = [1, 1.25, 1.5, 2, 3]
const SEEK_STEP_STORAGE_KEY = 'vfan-player-seek-step'
const DEFAULT_SEEK_STEP_SECONDS = 5

export interface VideoJsPlayerHandle {
  getCurrentTime: () => number
  getPlayer: () => Player | null
}

export interface VideoJsPlayerProps {
  adBlockEnabled: boolean
  autoPlay: boolean
  className?: string
  controls: PlayerControlsConfig
  errorLogs: PlayerErrorLog[]
  hasNextEpisode: boolean
  hasPreviousEpisode: boolean
  hlsSessionStats: HlsSessionStats
  initialTime: number
  isTheaterMode: boolean
  loadKey: string
  loop: boolean
  loopEnabled: boolean
  muted: boolean
  navigationLabels?: PlayerNavigationLabels
  playbackRate: number
  playlistFilteringEnabled: boolean
  retryTime: number
  seekableMode?: boolean | 'auto'
  sourceType?: 'hls'
  src: string
  title?: string
  variant: PlayerVariant
  volume: number
  onEnded?: () => void
  onHlsError: (message: string, fatal: boolean) => void
  onMediaError: (message: string) => void
  onNextEpisode?: () => void
  onPlaybackRateChange: (playbackRate: number) => void
  onPreviousEpisode?: () => void
  onProgress?: (progress: { currentTime: number; duration: number }) => void
  onRetry: () => void
  onSeekableChange: (seekable: boolean) => void
  onStatsUpdate: (stats: HlsSessionStats) => void
  onToggleLoop: () => void
  onTogglePlaylistFiltering: () => void
  onToggleTheaterMode?: () => void
  onVolumeChange: (volume: number, muted: boolean) => void
}

type PlayerCallbacks = Pick<
  VideoJsPlayerProps,
  | 'onEnded'
  | 'onHlsError'
  | 'onMediaError'
  | 'onPlaybackRateChange'
  | 'onProgress'
  | 'onSeekableChange'
  | 'onStatsUpdate'
  | 'onVolumeChange'
>

type SeekButtonsPlayer = Player & {
  seekButtons?: (options: { back: number; backIndex?: number; forward: number; forwardIndex?: number }) => void
  controlBar?: {
    seekBack?: { controlText?: (text: string) => void; options_: { seconds?: number } }
    seekForward?: { controlText?: (text: string) => void; options_: { seconds?: number } }
  }
}

function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref
}

export const VideoJsPlayer = forwardRef<VideoJsPlayerHandle, VideoJsPlayerProps>(function VideoJsPlayer(
  {
    adBlockEnabled,
    autoPlay,
    className,
    controls,
    errorLogs,
    hasNextEpisode,
    hasPreviousEpisode,
    hlsSessionStats,
    initialTime,
    isTheaterMode,
    loadKey,
    loop,
    loopEnabled,
    muted,
    navigationLabels,
    onEnded,
    onHlsError,
    onMediaError,
    onNextEpisode,
    onPlaybackRateChange,
    onPreviousEpisode,
    onProgress,
    onRetry,
    onSeekableChange,
    onStatsUpdate,
    onToggleLoop,
    onTogglePlaylistFiltering,
    onToggleTheaterMode,
    onVolumeChange,
    playbackRate,
    playlistFilteringEnabled,
    retryTime,
    seekableMode,
    sourceType,
    src,
    title,
    volume,
  },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<Player | null>(null)
  const hlsEngineRef = useRef<HlsEngineHandle | null>(null)
  const appliedLoadKeyRef = useRef('')
  const initialPlaybackRef = useRef({ loop, muted, volume })
  const [statsOpen, setStatsOpen] = useState(false)
  const [errorLogOpen, setErrorLogOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [seekStepSeconds, setSeekStepSeconds] = useState(() => readStoredSeekStep())
  const callbacksRef = useLatestRef<PlayerCallbacks>({
    onEnded,
    onHlsError,
    onMediaError,
    onPlaybackRateChange,
    onProgress,
    onSeekableChange,
    onStatsUpdate,
    onVolumeChange,
  })
  const contextRef = useLatestRef<VfanPlayerContext>({
    controls,
    hasNextEpisode,
    hasPreviousEpisode,
    hls: null,
    keyboardSeek: controls.keyboardSeek,
    loopEnabled,
    navigationLabels,
    playlistFilteringEnabled,
    seekStepSeconds,
    onNextEpisode,
    onPreviousEpisode,
    onRetry,
    onShowErrorLogs: () => setErrorLogOpen((current) => !current),
    onToggleSettings: () => setSettingsOpen((current) => !current),
    onToggleLoop,
    onTogglePlaylistFiltering,
    onToggleStats: () => setStatsOpen((current) => !current),
    onToggleTheaterMode,
  })

  useImperativeHandle(ref, () => ({
    getCurrentTime: () => playerRef.current?.currentTime() ?? 0,
    getPlayer: () => playerRef.current,
  }))

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return
    }

    registerVfanComponents()

    const videoElement = document.createElement('video')
    videoElement.className = 'video-js vjs-theme-fantasy vfantv-video-js vjs-fill'
    videoElement.setAttribute('playsinline', 'true')
    container.appendChild(videoElement)

    const sourceIsHls = isHlsSource(src, sourceType)
    const player = videojs(videoElement, {
      autoplay: autoPlay,
      controls: true,
      controlBar: { children: buildControlBarChildren() },
      fill: true,
      fluid: false,
      html5: {
        vhs: {
          overrideNative: false,
        },
      },
      language: 'zh-CN',
      loop: initialPlaybackRef.current.loop,
      muted: initialPlaybackRef.current.muted,
      playbackRates: PLAYBACK_RATES,
      preload: 'metadata',
      responsive: false,
      title: title ?? 'VfanTV 播放器',
      userActions: {
        hotkeys: createHotkeysHandler(),
      },
      volume: initialPlaybackRef.current.volume,
    })

    playerRef.current = player
    setVfanContext(player, contextRef.current)
    if (contextRef.current.controls.settings) {
      ;(player as SeekButtonsPlayer).seekButtons?.({
        back: contextRef.current.seekStepSeconds,
        backIndex: 1,
        forward: contextRef.current.seekStepSeconds,
        forwardIndex: 2,
      })
    }

    const applyStartTime = (): void => {
      const duration = player.duration() ?? 0
      if (appliedLoadKeyRef.current === loadKey || !Number.isFinite(duration) || duration <= 0) {
        return
      }

      const requestedTime = retryTime > 0 ? retryTime : initialTime
      if (requestedTime > 0 && requestedTime < duration) {
        player.currentTime(requestedTime)
      }
      appliedLoadKeyRef.current = loadKey
    }

    const syncSeekable = (): void => {
      if (seekableMode === 'auto') {
        callbacksRef.current.onSeekableChange(isPlayerSeekable(player))
      }
    }

    const onLoadedMetadata = (): void => {
      applyStartTime()
      syncSeekable()
    }
    const onDurationChange = (): void => syncSeekable()
    const onTimeUpdate = (): void => {
      const duration = player.duration() ?? 0
      callbacksRef.current.onProgress?.({
        currentTime: Math.floor(player.currentTime() ?? 0),
        duration: Number.isFinite(duration) ? Math.floor(duration) : 0,
      })
    }
    const onError = (): void => {
      const error = player.error()
      if (error) {
        callbacksRef.current.onMediaError(error.message || `媒体加载失败，错误代码 ${error.code}`)
      }
    }
    const onVolumeChangeEvent = (): void => {
      callbacksRef.current.onVolumeChange(player.volume() ?? 0, player.muted() ?? false)
    }
    const onRateChange = (): void => {
      callbacksRef.current.onPlaybackRateChange(player.playbackRate() ?? 1)
    }

    player.on('loadedmetadata', onLoadedMetadata)
    player.on('durationchange', onDurationChange)
    player.on('timeupdate', onTimeUpdate)
    player.on('ended', () => callbacksRef.current.onEnded?.())
    player.on('error', onError)
    player.on('volumechange', onVolumeChangeEvent)
    player.on('ratechange', onRateChange)
    player.src(sourceIsHls ? { src, type: 'application/x-mpegURL' } : src)

    if (sourceIsHls) {
      hlsEngineRef.current = attachHlsEngine({
        adBlockEnabled,
        autoPlay,
        player,
        src,
        video: videoElement,
        onError: (message, fatal) => callbacksRef.current.onHlsError(message, fatal),
        onHlsReady: (hls) => {
          updateVfanContext(player, { hls })
          syncHlsLevels(player, hls)
          updateControlBar(player)
        },
        onStatsUpdate: (stats) => callbacksRef.current.onStatsUpdate(stats),
      })
    }

    updateControlVisibility(player, contextRef.current.controls)
    player.ready(() => updateControlBar(player))

    if (autoPlay && !sourceIsHls) {
      void player.play()?.catch(() => undefined)
    }

    return () => {
      hlsEngineRef.current?.destroy()
      hlsEngineRef.current = null
      if (!player.isDisposed()) {
        player.dispose()
      }
      playerRef.current = null
      appliedLoadKeyRef.current = ''
      container.replaceChildren()
    }
  }, [
    adBlockEnabled,
    autoPlay,
    callbacksRef,
    contextRef,
    initialTime,
    isTheaterMode,
    loadKey,
    retryTime,
    seekableMode,
    sourceType,
    src,
    title,
  ])

  useEffect(() => {
    const player = playerRef.current
    if (!player || player.isDisposed()) {
      return
    }

    updateVfanContext(player, {
      controls,
      hasNextEpisode,
      hasPreviousEpisode,
      keyboardSeek: controls.keyboardSeek,
      loopEnabled,
      navigationLabels,
      playlistFilteringEnabled,
      seekStepSeconds,
      onNextEpisode,
      onPreviousEpisode,
      onRetry,
      onToggleLoop,
      onTogglePlaylistFiltering,
      onToggleTheaterMode,
    })
    player.loop(loop)
    updateControlVisibility(player, controls)
    updateControlBar(player)
  }, [
    controls,
    hasNextEpisode,
    hasPreviousEpisode,
    loop,
    loopEnabled,
    navigationLabels,
    onNextEpisode,
    onPreviousEpisode,
    onRetry,
    onToggleLoop,
    onTogglePlaylistFiltering,
    onToggleTheaterMode,
    playlistFilteringEnabled,
    seekStepSeconds,
  ])

  useEffect(() => {
    const player = playerRef.current
    if (!player || player.isDisposed()) {
      return
    }

    player.volume(volume)
    player.muted(muted)
    player.playbackRate(playbackRate)
  }, [muted, playbackRate, volume])

  useEffect(() => {
    const player = playerRef.current as SeekButtonsPlayer | null
    if (!player || player.isDisposed()) {
      return
    }

    updateSeekButtonSeconds(player, seekStepSeconds)
  }, [seekStepSeconds])

  return (
    <div
      className={cn(
        'relative min-h-0 w-full overflow-hidden bg-black',
        isTheaterMode ? 'h-full' : 'aspect-video',
        className,
      )}
      data-vjs-player
    >
      <div ref={containerRef} className="absolute inset-0" />
      <PlayerOverlays
        errorLogOpen={errorLogOpen}
        errorLogs={errorLogs}
        hlsSessionStats={hlsSessionStats}
        playerRef={playerRef}
        seekStepSeconds={seekStepSeconds}
        settingsOpen={settingsOpen}
        src={src}
        statsOpen={statsOpen}
        onCloseErrorLogs={() => setErrorLogOpen(false)}
        onCloseSettings={() => setSettingsOpen(false)}
        onCloseStats={() => setStatsOpen(false)}
        onSeekStepChange={(seconds) => {
          window.localStorage.setItem(SEEK_STEP_STORAGE_KEY, String(seconds))
          setSeekStepSeconds(seconds)
        }}
      />
    </div>
  )
})

function buildControlBarChildren(): string[] {
  return [
    'playToggle',
    'progressControl',
    'currentTimeDisplay',
    'timeDivider',
    'durationDisplay',
    'volumePanel',
    'SettingsButton',
    'playbackRateMenuButton',
    'LoopToggleButton',
    'EpisodeNavButton',
    'StatsButton',
    'RetryButton',
    'fullscreenToggle',
  ]
}

function readStoredSeekStep(): number {
  const storedValue = window.localStorage.getItem(SEEK_STEP_STORAGE_KEY)
  if (storedValue === null) {
    return DEFAULT_SEEK_STEP_SECONDS
  }

  const value = Number(storedValue)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SEEK_STEP_SECONDS
}

function updateControlVisibility(player: Player, controls: PlayerControlsConfig): void {
  const controlBar = player.getChild('controlBar')
  if (!controlBar) {
    return
  }

  toggleChild(controlBar, 'progressControl', controls.progress)
  toggleChild(controlBar, 'currentTimeDisplay', controls.time)
  toggleChild(controlBar, 'timeDivider', controls.time)
  toggleChild(controlBar, 'durationDisplay', controls.time)
  toggleChild(controlBar, 'SettingsButton', controls.settings)
  toggleChild(controlBar, 'playbackRateMenuButton', controls.settings)
  toggleChild(controlBar, 'LoopToggleButton', controls.loopToggle)
  toggleChild(controlBar, 'EpisodeNavButton', controls.episodeNav)
}

function updateSeekButtonSeconds(player: SeekButtonsPlayer, seconds: number): void {
  const back = player.controlBar?.seekBack
  const forward = player.controlBar?.seekForward

  if (back) {
    back.options_.seconds = seconds
    back.controlText?.(`后退 ${seconds} 秒`)
  }
  if (forward) {
    forward.options_.seconds = seconds
    forward.controlText?.(`前进 ${seconds} 秒`)
  }
}

function toggleChild(
  controlBar: { getChild: (name: string) => { show: () => void; hide: () => void } | undefined },
  name: string,
  visible: boolean,
): void {
  const child = controlBar.getChild(name)
  if (!child) {
    return
  }

  if (visible) {
    child.show()
  } else {
    child.hide()
  }
}

function syncHlsLevels(player: Player, hls: Hls): void {
  const sync = (): void => {
    ;(
      player as Player & {
        vfanHlsLevels?: Array<{ bitrate?: number; codecs?: string; height?: number; width?: number }>
      }
    ).vfanHlsLevels = hls.levels.map((level) => ({
      bitrate: level.bitrate,
      codecs: level.videoCodec,
      height: level.height,
      width: level.width,
    }))
    updateControlBar(player)
  }

  sync()
  hls.on(Hls.Events.MANIFEST_PARSED, sync)
  hls.on(Hls.Events.LEVEL_SWITCHED, sync)
}
