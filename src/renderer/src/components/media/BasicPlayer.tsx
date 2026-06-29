import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import Artplayer, { type Option } from 'artplayer'
import Hls from 'hls.js'
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
}

type ArtplayerWithCallbacks = Artplayer & { vfanCallbacksRef?: MutableRefObject<BasicPlayerCallbacks> }

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

  const isLive = variant === 'live'
  const isVod = variant === 'vod'
  const isHls = isHlsSource(src, sourceType)
  const adBlockEnabled = isVod && playlistFilteringEnabled
  const previousLabel = navigationLabels?.previous ?? '上一集'
  const nextLabel = navigationLabels?.next ?? '下一集'

  useEffect(() => {
    callbacksRef.current = {
      onEnded,
      onNextEpisode,
      onPreviousEpisode,
      onProgress,
    }
  }, [onEnded, onNextEpisode, onPreviousEpisode, onProgress])

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
      }),
      layers: buildLayers(),
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
    localizeInfoPanel(art, { formatPlaybackUrl, isLive, src })

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
    formatPlaybackUrl,
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
    src,
    title,
  ])

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
    </div>
  )
}

function buildControls({
  hasNextEpisode,
  hasPreviousEpisode,
  nextLabel,
  previousLabel,
}: {
  hasNextEpisode: boolean
  hasPreviousEpisode: boolean
  nextLabel: string
  previousLabel: string
}): NonNullable<Option['controls']> {
  return [
    {
      name: 'previous',
      position: 'left',
      index: 5,
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
      index: 15,
      html: createControlIcon('next'),
      tooltip: nextLabel,
      disable: !hasNextEpisode,
      click(this: Artplayer) {
        callbacksFromArt(this).onNextEpisode?.()
      },
    },
  ]
}

function buildLayers(): NonNullable<Option['layers']> {
  return [
    {
      name: 'top-actions',
      html: createTopActions(),
      mounted(this: Artplayer, element) {
        const statsButton = element.querySelector<HTMLButtonElement>('[data-player-action="stats"]')
        const retryButton = element.querySelector<HTMLButtonElement>('[data-player-action="retry"]')
        statsButton?.addEventListener('click', () => {
          this.info.show = !this.info.show
        })
        retryButton?.addEventListener('click', () => retryPlayback(this))
      },
    },
  ]
}

function callbacksFromArt(art: Artplayer): BasicPlayerCallbacks {
  return (art as ArtplayerWithCallbacks).vfanCallbacksRef?.current ?? {}
}

function createTopActions(): HTMLElement {
  const element = document.createElement('div')
  element.style.cssText = [
    'position:absolute',
    'top:12px',
    'right:12px',
    'z-index:100',
    'display:flex',
    'align-items:center',
    'gap:8px',
    'pointer-events:auto',
  ].join(';')
  element.innerHTML = `
    <button data-player-action="stats" type="button" title="统计信息" aria-label="统计信息">
      ${getControlIconSvg('stats')}
    </button>
    <button data-player-action="retry" type="button" title="刷新重试" aria-label="刷新重试">
      ${getControlIconSvg('retry')}
    </button>
  `

  for (const button of element.querySelectorAll<HTMLElement>('button')) {
    button.style.cssText = [
      'width:34px',
      'height:34px',
      'border:0',
      'border-radius:8px',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'color:rgba(255,255,255,.88)',
      'background:rgba(0,0,0,.48)',
      'cursor:pointer',
    ].join(';')
  }

  return element
}

function createControlIcon(name: 'next' | 'previous'): HTMLElement {
  const element = document.createElement('span')
  element.innerHTML = getControlIconSvg(name)
  return element
}

function getControlIconSvg(name: 'next' | 'previous' | 'retry' | 'stats'): string {
  const paths: Record<typeof name, string> = {
    previous: '<path d="m19 20-10-8 10-8v16Z"/><path d="M5 19V5"/>',
    next: '<path d="m5 4 10 8-10 8V4Z"/><path d="M19 5v14"/>',
    retry:
      '<path d="M3 12a9 9 0 0 1 15.53-6.21"/><path d="M18 2v4h-4"/><path d="M21 12a9 9 0 0 1-15.53 6.21"/><path d="M6 22v-4h4"/>',
    stats: '<circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><path d="M12 7h.01"/>',
  }

  return `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`
}

function retryPlayback(art: Artplayer): void {
  const currentTime = art.currentTime
  void art
    .switchUrl(art.url)
    .then(() => {
      if (currentTime > 0 && Number.isFinite(art.duration) && currentTime < art.duration) {
        art.currentTime = currentTime
      }
      return art.play()
    })
    .catch((error: unknown) => {
      art.notice.show = error instanceof Error ? error.message : '刷新重试失败'
    })
}

function localizeInfoPanel(
  art: Artplayer,
  {
    formatPlaybackUrl,
    isLive,
    src,
  }: {
    formatPlaybackUrl: (src: string) => string
    isLive: boolean
    src: string
  },
): void {
  const { $infoClose, $infoPanel } = art.template
  $infoClose.textContent = '关闭'
  $infoPanel.innerHTML = `
    <div class="art-info-item">
      <div class="art-info-title">播放器版本：</div>
      <div class="art-info-content">${Artplayer.version}</div>
    </div>
    <div class="art-info-item">
      <div class="art-info-title">播放地址：</div>
      <div class="art-info-content" data-vfan-info="url"></div>
    </div>
    <div class="art-info-item">
      <div class="art-info-title">音量：</div>
      <div class="art-info-content" data-vfan-info="volume"></div>
    </div>
    <div class="art-info-item">
      <div class="art-info-title">播放时间：</div>
      <div class="art-info-content" data-vfan-info="time"></div>
    </div>
    <div class="art-info-item">
      <div class="art-info-title">总时长：</div>
      <div class="art-info-content" data-vfan-info="duration"></div>
    </div>
    <div class="art-info-item">
      <div class="art-info-title">分辨率：</div>
      <div class="art-info-content" data-vfan-info="resolution"></div>
    </div>
  `

  const refresh = (): void => {
    setInfoText($infoPanel, 'url', formatPlaybackUrl(src))
    setInfoText($infoPanel, 'volume', `${Math.round(art.volume * 100)}%`)
    setInfoText($infoPanel, 'time', formatTime(art.currentTime))
    setInfoText($infoPanel, 'duration', isLive ? '直播' : formatTime(art.duration))
    setInfoText(
      $infoPanel,
      'resolution',
      art.video.videoWidth > 0 && art.video.videoHeight > 0
        ? `${art.video.videoWidth} x ${art.video.videoHeight}`
        : '-',
    )
  }

  refresh()
  const timer = window.setInterval(refresh, 1000)
  art.on('destroy', () => window.clearInterval(timer))
}

function setInfoText(panel: HTMLElement, name: string, value: string): void {
  const element = panel.querySelector(`[data-vfan-info="${name}"]`)
  if (element && element.textContent !== value) {
    element.textContent = value
  }
}

function formatPlaybackUrlForDisplay(src: string): string {
  return src
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
