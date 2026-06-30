import { useEffect, useRef, type MutableRefObject } from 'react'
import Artplayer, { type Option } from 'artplayer'
import artplayerPluginAmbilight from 'artplayer-plugin-ambilight'
import artplayerPluginAudioTrack from 'artplayer-plugin-audio-track'
import artplayerPluginHlsControl from 'artplayer-plugin-hls-control'
import Hls from 'hls.js'
import { cn } from '@renderer/lib/utils'

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

export function BasicPlayer({
  autoPlay = false,
  audioTrackUrl,
  className,
  initialTime = 0,
  isTheaterMode = false,
  loop = false,
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

  const isLive = variant === 'live'
  const isHls = isHlsSource(src, sourceType)

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
        title: title ?? 'VfanTV 播放器', // 透传 video title 属性
      },
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
                  setting: true, // 在设置面板显示 HLS 清晰度入口
                  title: 'Quality', // HLS 清晰度菜单标题
                  auto: 'Auto', // HLS 自动清晰度文案
                },
                audio: {
                  control: true, // 在控制栏显示 HLS 音轨入口
                  setting: true, // 在设置面板显示 HLS 音轨入口
                  title: 'Audio', // HLS 音轨菜单标题
                  auto: 'Auto', // HLS 自动音轨文案
                },
              }),
            ]
          : []),
      ],
      customType: {
        // 自定义媒体类型处理器
        m3u8(video, url, artInstance) {
          destroyHls(hlsRef)

          if (Hls.isSupported()) {
            const hls = new Hls()
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

    const applyStartTime = (): void => {
      if (!isLive && initialTime > 0 && Number.isFinite(art.duration) && initialTime < art.duration) {
        art.currentTime = initialTime
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
  }, [audioTrackUrl, autoPlay, initialTime, isHls, isLive, loop, src, title])

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

function destroyHls(hlsRef: MutableRefObject<Hls | null>): void {
  hlsRef.current?.destroy()
  hlsRef.current = null
}
