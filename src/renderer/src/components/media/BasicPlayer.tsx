import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import Artplayer, { type Option } from 'artplayer'
import Hls from 'hls.js'
import { toast } from 'sonner'
import { cn } from '@renderer/lib/utils'
import { createFilteredHlsLoader } from '@renderer/lib/hls-playlist-filter'

const HLS_PLAYLIST_FILTER_STORAGE_KEY = 'enable_blockad'
const PLAYER_VOLUME_STORAGE_KEY = 'vfan-player-volume'
const DEFAULT_PLAYER_VOLUME = 0.8
const PLAYER_THEME = '#ffffff'

export type PlayerVariant = 'vod' | 'live'

export interface PlayerNavigationLabels {
  previous: string
  next: string
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
  formatPlaybackUrl?: (src: string) => string
  onNextEpisode?: () => void
  onEnded?: () => void
  onPreviousEpisode?: () => void
  onProgress?: (progress: { currentTime: number; duration: number }) => void
  onToggleTheaterMode?: () => void
  variant?: PlayerVariant
}

interface BasicPlayerCallbacks {
  onEnded?: () => void
  onNextEpisode?: () => void
  onPreviousEpisode?: () => void
  onProgress?: (progress: { currentTime: number; duration: number }) => void
  onToggleStats?: () => void
  onToggleTheaterMode?: () => void
}

interface PlayerStatsSnapshot {
  bufferHealth: string
  currentTime: string
  duration: string
  playbackUrl: string
  playbackUrlDisplay: string
  resolution: string
  streamType: string
  volume: string
}

export function BasicPlayer({
  autoPlay = false,
  className,
  hasNextEpisode = false,
  hasPreviousEpisode = false,
  initialTime = 0,
  isTheaterMode = false,
  loop = false,
  formatPlaybackUrl = formatPlaybackUrlForDisplay,
  navigationLabels,
  onEnded,
  onNextEpisode,
  onPreviousEpisode,
  onProgress,
  onToggleTheaterMode,
  sourceType,
  src,
  title,
  variant = 'vod',
}: BasicPlayerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const artRef = useRef<Artplayer | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const retryTimeRef = useRef(0)
  const resumeAfterReloadRef = useRef(false)
  const callbacksRef = useRef<BasicPlayerCallbacks>({})
  const [playlistFilteringEnabled, setPlaylistFilteringEnabled] = useState(() => readPlaylistFilteringEnabled())
  const [isStatsOpen, setIsStatsOpen] = useState(false)
  const [stats, setStats] = useState<PlayerStatsSnapshot>(() =>
    buildStatsSnapshot({
      art: null,
      formatPlaybackUrl,
      isLive: variant === 'live',
      src,
    }),
  )

  const isLive = variant === 'live'
  const isVod = variant === 'vod'
  const isHls = isHlsSource(src, sourceType)
  const adBlockEnabled = isVod && playlistFilteringEnabled
  const previousLabel = navigationLabels?.previous ?? '上一集'
  const nextLabel = navigationLabels?.next ?? '下一集'
  const showTheaterMode = Boolean(onToggleTheaterMode)

  useEffect(() => {
    callbacksRef.current = {
      onEnded,
      onNextEpisode,
      onPreviousEpisode,
      onProgress,
      onToggleStats: () => setIsStatsOpen((current) => !current),
      onToggleTheaterMode,
    }
  }, [onEnded, onNextEpisode, onPreviousEpisode, onProgress, onToggleTheaterMode])

  useEffect(() => {
    const art = artRef.current
    if (!art) {
      return
    }

    art.notice.show = isTheaterMode ? '影院模式' : ''
  }, [isTheaterMode])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !src) {
      return
    }

    destroyHls(hlsRef)
    container.innerHTML = ''
    container.setAttribute('aria-label', title ?? 'VfanTV 播放器')

    const art = new Artplayer({
      container,
      url: src,
      type: isHls ? 'm3u8' : undefined,
      theme: PLAYER_THEME,
      volume: readStoredPlayerVolume(),
      muted: false,
      autoplay: autoPlay,
      loop,
      isLive,
      setting: isVod,
      playbackRate: isVod,
      hotkey: true,
      fullscreen: true,
      fullscreenWeb: true,
      miniProgressBar: isVod,
      playsInline: true,
      mutex: true,
      backdrop: true,
      moreVideoAttr: {
        preload: 'metadata',
        playsInline: true,
        title: title ?? 'VfanTV 播放器',
      },
      controls: buildControls({
        hasNextEpisode,
        hasPreviousEpisode,
        nextLabel,
        previousLabel,
        showStats: Boolean(src),
        showTheaterMode,
      }),
      settings: isVod
        ? [
            {
              name: 'playlist-filtering',
              html: '去广告（实验性）',
              switch: playlistFilteringEnabled,
              onSwitch(item) {
                const nextEnabled = !item.switch
                item.switch = nextEnabled
                window.localStorage.setItem(HLS_PLAYLIST_FILTER_STORAGE_KEY, String(nextEnabled))
                retryTimeRef.current = artRef.current?.currentTime ?? 0
                resumeAfterReloadRef.current = true
                setPlaylistFilteringEnabled(nextEnabled)
              },
            },
          ]
        : [],
      customType: {
        m3u8(video, url, artInstance) {
          destroyHls(hlsRef)

          if (Hls.isSupported()) {
            const hls = new Hls(adBlockEnabled ? { loader: createFilteredHlsLoader(Hls) } : undefined)
            hlsRef.current = hls
            artInstance.hls = hls
            hls.loadSource(url)
            hls.attachMedia(video)
            hls.on(Hls.Events.ERROR, (_event, data) => {
              if (data.fatal) {
                artInstance.notice.show = `播放失败：${data.details}`
              }
            })
            return
          }

          if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url
            return
          }

          artInstance.notice.show = '当前环境不支持 HLS 播放'
        },
      },
    } satisfies Option)

    artRef.current = art
    ;(art as ArtplayerWithCallbacks).vfanCallbacksRef = callbacksRef

    const applyStartTime = (): void => {
      const requestedTime = retryTimeRef.current > 0 ? retryTimeRef.current : initialTime
      if (requestedTime > 0 && Number.isFinite(art.duration) && requestedTime < art.duration) {
        art.currentTime = requestedTime
      }
      retryTimeRef.current = 0

      if (resumeAfterReloadRef.current) {
        resumeAfterReloadRef.current = false
        void art.play()
      }
    }

    art.on('ready', applyStartTime)
    art.on('video:canplay', applyStartTime)
    art.on('video:timeupdate', () => {
      callbacksRef.current.onProgress?.({
        currentTime: Math.floor(art.currentTime),
        duration: Number.isFinite(art.duration) ? Math.floor(art.duration) : 0,
      })
    })
    art.on('video:ended', () => callbacksRef.current.onEnded?.())
    art.on('video:volumechange', () => {
      window.localStorage.setItem(PLAYER_VOLUME_STORAGE_KEY, String(art.volume))
    })
    art.on('error', (error) => {
      art.notice.show = error.message || '播放器加载失败'
    })

    return () => {
      destroyHls(hlsRef)
      art.destroy(false)
      if (artRef.current === art) {
        artRef.current = null
      }
      container.innerHTML = ''
    }
  }, [
    adBlockEnabled,
    autoPlay,
    hasNextEpisode,
    hasPreviousEpisode,
    initialTime,
    isHls,
    isLive,
    isVod,
    loop,
    nextLabel,
    playlistFilteringEnabled,
    previousLabel,
    showTheaterMode,
    src,
    title,
  ])

  useEffect(() => {
    if (!isStatsOpen) {
      return
    }

    const refreshStats = (): void => {
      setStats(
        buildStatsSnapshot({
          art: artRef.current,
          formatPlaybackUrl,
          isLive,
          src,
        }),
      )
    }

    refreshStats()
    const timer = window.setInterval(refreshStats, 500)
    return () => window.clearInterval(timer)
  }, [formatPlaybackUrl, isLive, isStatsOpen, src])

  if (!src) {
    return (
      <div className={cn('relative w-full overflow-hidden bg-black', isTheaterMode && 'h-full', className)}>
        <div aria-hidden="true" className="pointer-events-none w-full pt-14 pb-16">
          <div className={cn('w-full', isTheaterMode ? 'h-full' : 'aspect-video')} />
        </div>
        <div
          className={cn(
            'absolute inset-x-0 flex items-center justify-center text-sm text-white/55',
            isTheaterMode ? 'inset-y-0' : 'top-14 bottom-16',
          )}
        >
          请选择一个可播放剧集
        </div>
      </div>
    )
  }

  return (
    <div className={cn('relative w-full overflow-hidden bg-black', isTheaterMode && 'h-full', className)}>
      <div ref={containerRef} className="h-full w-full [&_.art-video]:object-contain" />
      <PlayerStatsOverlay
        open={isStatsOpen}
        stats={stats}
        onClose={() => setIsStatsOpen(false)}
        onCopy={() => void copyPlaybackUrl(src)}
      />
    </div>
  )
}

function buildControls({
  hasNextEpisode,
  hasPreviousEpisode,
  nextLabel,
  previousLabel,
  showStats,
  showTheaterMode,
}: {
  hasNextEpisode: boolean
  hasPreviousEpisode: boolean
  nextLabel: string
  previousLabel: string
  showStats: boolean
  showTheaterMode: boolean
}): NonNullable<Option['controls']> {
  return [
    {
      name: 'previous',
      position: 'left',
      html: createControlIcon('previous'),
      tooltip: previousLabel,
      disable: !hasPreviousEpisode,
      click(this: Artplayer) {
        callbacksFromArt(this).onPreviousEpisode?.()
      },
    },
    {
      name: 'next',
      position: 'left',
      html: createControlIcon('next'),
      tooltip: nextLabel,
      disable: !hasNextEpisode,
      click(this: Artplayer) {
        callbacksFromArt(this).onNextEpisode?.()
      },
    },
    ...(showStats
      ? [
          {
            name: 'stats',
            position: 'right' as const,
            html: createControlIcon('stats'),
            tooltip: '统计信息',
            click(this: Artplayer) {
              callbacksFromArt(this).onToggleStats?.()
            },
          },
        ]
      : []),
    {
      name: 'retry',
      position: 'right',
      html: createControlIcon('retry'),
      tooltip: '刷新重试',
      click(this: Artplayer) {
        const currentTime = this.currentTime
        void this.switchUrl(this.url)
          .then(() => {
            if (currentTime > 0 && Number.isFinite(this.duration) && currentTime < this.duration) {
              this.currentTime = currentTime
            }
            return this.play()
          })
          .catch((error: unknown) => {
            this.notice.show = error instanceof Error ? error.message : '刷新重试失败'
          })
      },
    },
    ...(showTheaterMode
      ? [
          {
            name: 'theater-mode',
            position: 'right' as const,
            html: createControlIcon('theater'),
            tooltip: '影院模式',
            click(this: Artplayer) {
              callbacksFromArt(this).onToggleTheaterMode?.()
            },
          },
        ]
      : []),
  ]
}

function callbacksFromArt(art: Artplayer): BasicPlayerCallbacks {
  return (art as ArtplayerWithCallbacks).vfanCallbacksRef?.current ?? {}
}

type ArtplayerWithCallbacks = Artplayer & { vfanCallbacksRef?: MutableRefObject<BasicPlayerCallbacks> }

function PlayerStatsOverlay({
  open,
  stats,
  onClose,
  onCopy,
}: {
  open: boolean
  stats: PlayerStatsSnapshot
  onClose: () => void
  onCopy: () => void
}): React.JSX.Element | null {
  if (!open) {
    return null
  }

  return (
    <div className="absolute top-4 right-4 z-30 w-[min(26rem,calc(100%-2rem))] rounded-lg border border-white/10 bg-black/86 p-4 text-white shadow-2xl shadow-black/40 backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-white/92">统计信息</div>
        <button
          className="rounded-md px-2 py-1 text-xs font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          type="button"
          onClick={onClose}
        >
          关闭
        </button>
      </div>
      <div className="grid gap-2 text-xs">
        <StatsRow label="类型" value={stats.streamType} />
        <StatsRow label="时间" value={`${stats.currentTime} / ${stats.duration}`} />
        <StatsRow label="分辨率" value={stats.resolution} />
        <StatsRow label="缓冲" value={stats.bufferHealth} />
        <StatsRow label="音量" value={stats.volume} />
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-3 border-t border-white/10 pt-3">
          <div className="text-white/45">播放地址</div>
          <div className="min-w-0">
            <div className="truncate font-mono text-white/82" title={stats.playbackUrl}>
              {stats.playbackUrlDisplay}
            </div>
            <button
              className="mt-2 rounded-md bg-white/10 px-2 py-1 text-xs font-semibold text-white/88 transition-colors hover:bg-white/18"
              type="button"
              onClick={onCopy}
            >
              复制地址
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatsRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3">
      <div className="text-white/45">{label}</div>
      <div className="min-w-0 truncate text-white/82">{value}</div>
    </div>
  )
}

function createControlIcon(name: 'next' | 'previous' | 'retry' | 'stats' | 'theater'): HTMLElement {
  const element = document.createElement('span')
  element.className = 'vfan-art-control-icon'
  element.innerHTML = getControlIconSvg(name)
  return element
}

function getControlIconSvg(name: 'next' | 'previous' | 'retry' | 'stats' | 'theater'): string {
  const paths: Record<typeof name, string> = {
    previous: '<path d="m19 20-10-8 10-8v16Z"/><path d="M5 19V5"/>',
    next: '<path d="m5 4 10 8-10 8V4Z"/><path d="M19 5v14"/>',
    retry: '<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>',
    stats: '<path d="M3 3v18h18"/><path d="M7 16v-5"/><path d="M12 16V7"/><path d="M17 16v-3"/>',
    theater: '<rect x="3" y="6" width="18" height="11" rx="2"/><path d="M3 17h18"/>',
  }

  return `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`
}

function buildStatsSnapshot({
  art,
  formatPlaybackUrl,
  isLive,
  src,
}: {
  art: Artplayer | null
  formatPlaybackUrl: (src: string) => string
  isLive: boolean
  src?: string
}): PlayerStatsSnapshot {
  const video = art?.video
  const duration = art?.duration ?? 0
  const volume = art?.volume ?? readStoredPlayerVolume()
  const playbackUrl = src ?? ''

  return {
    bufferHealth: formatSeconds(art?.loadedTime ?? 0),
    currentTime: formatTime(art?.currentTime ?? 0),
    duration: isLive ? '直播' : formatTime(duration),
    playbackUrl,
    playbackUrlDisplay: playbackUrl ? formatPlaybackUrl(playbackUrl) : '-',
    resolution:
      video && video.videoWidth > 0 && video.videoHeight > 0 ? `${video.videoWidth}x${video.videoHeight}` : '-',
    streamType: isLive ? '直播' : '点播',
    volume: `${Math.round(volume * 100)}%`,
  }
}

function formatPlaybackUrlForDisplay(src: string): string {
  try {
    const url = new URL(src)
    const filename = url.pathname.split('/').filter(Boolean).at(-1)
    const search = url.search ? `?${url.searchParams.size} params` : ''
    return `${url.origin}/${filename ?? ''}${search}`
  } catch {
    return src.length > 96 ? `${src.slice(0, 48)}...${src.slice(-36)}` : src
  }
}

async function copyPlaybackUrl(src: string | undefined): Promise<void> {
  if (!src) {
    return
  }

  try {
    await navigator.clipboard.writeText(src)
    toast.success('播放地址已复制')
  } catch {
    toast.error('复制失败')
  }
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '00:00'
  }

  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (value: number): string => String(value).padStart(2, '0')
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}` : `${pad(minutes)}:${pad(secs)}`
}

function formatSeconds(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '-'
  }

  return `${Math.round(seconds)} 秒`
}

function isHlsSource(src: string | undefined, sourceType: BasicPlayerProps['sourceType']): boolean {
  if (!src) {
    return false
  }

  return sourceType === 'hls' || /\.m3u8(?:$|[?#])/i.test(src)
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

function destroyHls(hlsRef: MutableRefObject<Hls | null>): void {
  hlsRef.current?.destroy()
  hlsRef.current = null
}
