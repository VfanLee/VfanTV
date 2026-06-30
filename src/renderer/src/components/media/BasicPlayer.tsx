import { useEffect, useRef, useState, type MutableRefObject } from 'react'
import Artplayer, { type Option } from 'artplayer'
import artplayerPluginAmbilight from 'artplayer-plugin-ambilight'
import artplayerPluginAudioTrack from 'artplayer-plugin-audio-track'
import artplayerPluginHlsControl from 'artplayer-plugin-hls-control'
import Hls from 'hls.js'
import { HLS_AD_FILTER_STORAGE_KEY } from '@shared/constants'
import { cn } from '@renderer/lib/utils'
import { createFilteredHlsLoader } from '@renderer/lib/hls-playlist-filter'

export type PlayerVariant = 'vod' | 'live'

export interface PlayerNavigationLabels {
  previous: string
  next: string
}

export interface BasicPlayerProps {
  autoPlay?: boolean
  audioTrackUrl?: string
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
  onProgress?: (progress: { currentTime: number; duration: number }) => void
}

type ArtplayerWithHls = Artplayer & { hls?: Hls }

export function BasicPlayer({
  autoPlay = false,
  audioTrackUrl,
  className,
  initialTime = 0,
  isTheaterMode = false,
  loop = false,
  formatPlaybackUrl = normalizePlaybackUrlForDisplay,
  onEnded,
  onProgress,
  sourceType,
  src,
  title,
  variant = 'vod',
}: BasicPlayerProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const artRef = useRef<Artplayer | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const callbacksRef = useRef<BasicPlayerCallbacks>({})
  const resumeTimeRef = useRef(0)
  const [adFilterEnabled, setAdFilterEnabled] = useState(() => readAdFilterEnabled())

  const isLive = variant === 'live'
  const isHls = isHlsSource(src, sourceType)
  const canUseAdFilter = isHls && !isLive

  useEffect(() => {
    callbacksRef.current = {
      onEnded,
      onProgress,
    }
  }, [onEnded, onProgress])

  useEffect(() => {
    const container = containerRef.current
    if (!container || !src) {
      return
    }

    destroyHls(hlsRef)
    container.innerHTML = ''
    container.setAttribute('aria-label', title ?? 'VfanTV 播放器')
    const displayPlaybackUrl = formatPlaybackUrl(src)

    // https://artplayer.org/document/start/option.html
    const art = new Artplayer({
      container, // 播放器挂载的 DOM 容器
      url: src, // 当前实际播放地址
      type: isHls ? 'm3u8' : '', // 播放源类型，HLS 源交给 customType.m3u8 处理
      autoplay: autoPlay, // 是否自动播放
      loop, // 是否循环播放
      isLive, // 是否启用直播模式
      setting: true, // 是否显示原生设置面板
      playbackRate: !isLive, // 是否显示倍速菜单，直播不显示
      aspectRatio: true, // 是否启用画面比例菜单
      flip: true, // 是否启用画面翻转菜单
      hotkey: true, // 是否启用 ArtPlayer 原生快捷键
      pip: true, // 是否启用画中画
      fullscreen: true, // 是否启用浏览器全屏
      fullscreenWeb: true, // 是否启用网页全屏
      miniProgressBar: !isLive, // 是否显示迷你进度条，直播不显示
      screenshot: true, // 是否启用截图
      lock: true, // 是否启用移动端锁定按钮
      fastForward: true, // 是否启用长按快进
      autoOrientation: true, // 是否启用移动端全屏自动横屏
      airplay: true, // 是否启用 AirPlay
      playsInline: true, // 是否内联播放，避免移动端强制全屏
      mutex: true, // 是否与页面上的其他 ArtPlayer 实例互斥播放
      backdrop: true, // 是否显示控制栏背景遮罩
      moreVideoAttr: {
        preload: 'metadata', // 只预加载媒体元信息
        playsInline: true, // 透传 video playsinline 属性
      },
      settings: [
        ...(canUseAdFilter
          ? [
              {
                name: 'hls-ad-filter',
                html: '去广告（试验性）',
                tooltip: adFilterEnabled ? '开启' : '关闭',
                switch: adFilterEnabled,
                onSwitch(item) {
                  const nextEnabled = !item.switch
                  item.switch = nextEnabled
                  item.tooltip = nextEnabled ? '开启' : '关闭'
                  window.localStorage.setItem(HLS_AD_FILTER_STORAGE_KEY, String(nextEnabled))
                  resumeTimeRef.current = art.currentTime
                  setAdFilterEnabled(nextEnabled)
                },
              },
            ]
          : []),
      ],
      plugins: [
        // 背光插件
        artplayerPluginAmbilight({
          blur: '30px', // 背光模糊半径
          opacity: 0.5, // 背光透明度
        }),
        // 独立外部音轨插件
        ...(audioTrackUrl
          ? [
              artplayerPluginAudioTrack({
                url: audioTrackUrl, // 独立外部音轨地址
              }),
            ]
          : []),
        ...(isHls
          ? [
              // HLS 控制插件
              artplayerPluginHlsControl({
                quality: {
                  control: true, // 在控制栏显示 HLS 清晰度入口
                  setting: false, // 在设置面板显示 HLS 清晰度入口
                  title: '清晰度', // HLS 清晰度菜单标题
                  auto: '自动', // HLS 自动清晰度文案
                },
                audio: {
                  control: false, // 在控制栏显示 HLS 音轨入口
                  setting: false, // 在设置面板显示 HLS 音轨入口
                  title: '音轨', // HLS 音轨菜单标题
                  auto: '自动', // HLS 自动音轨文案
                },
              }),
            ]
          : []),
      ],
      contextmenu: [
        {
          name: 'vfan-version',
          html: `播放器版本：${Artplayer.version}`,
        },
        {
          name: 'vfan-url',
          html: '播放地址',
          click: (contextmenu) => {
            void navigator.clipboard.writeText(displayPlaybackUrl)
            art.notice.show = '播放地址已复制'
            contextmenu.show = false
          },
          mounted(element) {
            element.title = displayPlaybackUrl
          },
        },
        ...(isHls
          ? [
              {
                name: 'vfan-quality',
                html: '清晰度：自动',
                mounted(this: Artplayer, element) {
                  refreshContextQualityText(this, element)
                  this.on('ready', () => refreshContextQualityText(this, element))
                  this.on('restart', () => refreshContextQualityText(this, element))
                },
              },
              {
                name: 'vfan-download-speed',
                html: '下载速度：检测中',
                mounted(this: Artplayer, element) {
                  refreshContextDownloadSpeedText(this, element)
                  const timer = window.setInterval(() => refreshContextDownloadSpeedText(this, element), 1000)
                  this.on('destroy', () => window.clearInterval(timer))
                },
              },
            ]
          : []),
        {
          name: 'vfan-refresh',
          html: '刷新',
          click: (contextmenu) => {
            reloadPlayback(art)
            contextmenu.show = false
          },
        },
      ],
      customType: {
        // 自定义媒体类型处理器
        m3u8(video, url, artInstance) {
          destroyHls(hlsRef)

          if (Hls.isSupported()) {
            const hls = new Hls(adFilterEnabled ? { loader: createFilteredHlsLoader(Hls) } : undefined)
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
    removeDefaultContextMenuItems(art)
    localizeInfoPanel(art, displayPlaybackUrl)
    art.on('ready', () => moveHlsQualityControl(art))
    art.on('restart', () => moveHlsQualityControl(art))

    const applyStartTime = (): void => {
      const requestedTime = resumeTimeRef.current > 0 ? resumeTimeRef.current : initialTime
      if (!isLive && requestedTime > 0 && Number.isFinite(art.duration) && requestedTime < art.duration) {
        art.currentTime = requestedTime
      }
      resumeTimeRef.current = 0
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
    adFilterEnabled,
    audioTrackUrl,
    autoPlay,
    canUseAdFilter,
    formatPlaybackUrl,
    initialTime,
    isHls,
    isLive,
    loop,
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
      <div ref={containerRef} className="h-full w-full" />
    </div>
  )
}

function isHlsSource(src: string | undefined, sourceType: BasicPlayerProps['sourceType']): boolean {
  if (!src) {
    return false
  }

  return sourceType === 'hls' || /\.m3u8(?:$|[?#])/i.test(src)
}

function removeDefaultContextMenuItems(art: Artplayer): void {
  for (const name of ['playbackRate', 'aspectRatio', 'flip', 'info', 'version', 'close']) {
    try {
      art.contextmenu.remove(name)
    } catch {
      // Ignore missing built-in context menu entries.
    }
  }
}

function moveHlsQualityControl(art: Artplayer): void {
  const qualityControl = art.controls['hls-quality']
  const settingControl = art.controls['setting']
  if (!qualityControl || !settingControl || qualityControl.nextElementSibling === settingControl) {
    return
  }

  qualityControl.dataset.index = '25'
  settingControl.insertAdjacentElement('beforebegin', qualityControl)
}

function refreshContextQualityText(art: Artplayer, element: HTMLElement): void {
  const hls = (art as ArtplayerWithHls).hls
  const currentLevel = hls?.currentLevel
  const level = typeof currentLevel === 'number' && currentLevel >= 0 ? hls?.levels[currentLevel] : undefined
  const qualityName = level?.name || (level?.height ? `${level.height}P` : '自动')
  element.textContent = `清晰度：${qualityName}`
}

function refreshContextDownloadSpeedText(art: Artplayer, element: HTMLElement): void {
  const estimate = (art as ArtplayerWithHls).hls?.bandwidthEstimate
  element.textContent = `下载速度：${formatBandwidthEstimate(estimate)}`
}

function formatBandwidthEstimate(bitsPerSecond: number | undefined): string {
  if (!bitsPerSecond || !Number.isFinite(bitsPerSecond) || bitsPerSecond <= 0) {
    return '检测中'
  }

  if (bitsPerSecond >= 1_000_000) {
    return `${(bitsPerSecond / 1_000_000).toFixed(2)} Mbps`
  }

  return `${Math.round(bitsPerSecond / 1000)} Kbps`
}

function reloadPlayback(art: Artplayer): void {
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
      art.notice.show = error instanceof Error ? error.message : '刷新失败'
    })
}

function localizeInfoPanel(art: Artplayer, playbackUrl: string): void {
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
    setInfoText($infoPanel, 'url', playbackUrl)
    setInfoText($infoPanel, 'volume', `${Math.round(art.volume * 100)}%`)
    setInfoText($infoPanel, 'time', formatInfoTime(art.currentTime))
    setInfoText($infoPanel, 'duration', formatInfoTime(art.duration))
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

function formatInfoTime(seconds: number): string {
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

function readAdFilterEnabled(): boolean {
  return window.localStorage.getItem(HLS_AD_FILTER_STORAGE_KEY) === 'true'
}

function normalizePlaybackUrlForDisplay(src: string): string {
  try {
    const parsedUrl = new URL(src)
    const proxyTargetUrl = parsedUrl.searchParams.get('url')
    return proxyTargetUrl ? decodeURIComponent(proxyTargetUrl) : decodeURIComponent(src)
  } catch {
    return src
  }
}

function destroyHls(hlsRef: MutableRefObject<Hls | null>): void {
  hlsRef.current?.destroy()
  hlsRef.current = null
}
