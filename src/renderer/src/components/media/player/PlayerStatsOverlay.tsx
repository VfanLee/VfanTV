import { useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import type { PlayerStatsSnapshot } from './types'

interface PlayerStatsOverlayProps {
  open: boolean
  stats: PlayerStatsSnapshot
  onClose: () => void
}

export function PlayerStatsOverlay({ open, stats, onClose }: PlayerStatsOverlayProps): React.JSX.Element | null {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  if (!open) {
    return null
  }

  const copyUrl = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(stats.src)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }

    window.setTimeout(() => setCopyState('idle'), 2000)
  }

  const rows: Array<{ label: string; value: string }> = [
    { label: '视口', value: stats.viewport },
    { label: '帧信息', value: stats.frames },
    { label: '当前 / 最高', value: `${stats.currentResolution} / ${stats.optimalResolution}` },
    { label: '码率', value: stats.bitrate },
    { label: '连接速度', value: stats.connectionSpeed },
    { label: '缓冲健康', value: stats.bufferHealth },
    { label: '网络活动', value: stats.networkActivity },
    { label: '编码', value: stats.codecs },
    { label: '流类型', value: stats.streamType },
  ]

  if (stats.liveLatency != null) {
    rows.push({ label: '直播延迟', value: stats.liveLatency })
  }

  rows.push({ label: '时间', value: stats.timestamp })

  return (
    <div
      aria-label="播放统计"
      className="pointer-events-auto absolute top-16 left-3 z-25 max-w-[420px] min-w-[280px] rounded-lg border border-white/10 bg-black/75 px-3 py-2.5 text-white/90 shadow-xl shadow-black/40 backdrop-blur-sm"
      role="dialog"
    >
      <div className="mb-2 flex items-center justify-between gap-3 border-b border-white/10 pb-2">
        <span className="text-[11px] font-semibold tracking-wide text-white/95">播放统计</span>
        <button
          aria-label="关闭播放统计"
          className="inline-flex size-6 items-center justify-center rounded text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          type="button"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      <dl className="space-y-0.5 font-mono text-[11px] leading-5">
        {rows.map((row) => (
          <div key={row.label} className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
            <dt className="text-right text-white/55">{row.label}</dt>
            <dd className="min-w-0 break-all text-white/92">{row.value}</dd>
          </div>
        ))}

        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 pt-1">
          <dt className="text-right text-white/55">播放地址</dt>
          <dd className="min-w-0">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1 break-all text-white/92">{stats.src}</span>
              <button
                aria-label="复制播放地址"
                className={cn(
                  'inline-flex size-6 shrink-0 items-center justify-center rounded text-white/70 transition-colors hover:bg-white/10 hover:text-white',
                  copyState === 'copied' && 'text-emerald-300',
                  copyState === 'failed' && 'text-red-300',
                )}
                title={copyState === 'copied' ? '已复制' : copyState === 'failed' ? '复制失败' : '复制'}
                type="button"
                onClick={() => void copyUrl()}
              >
                {copyState === 'copied' ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          </dd>
        </div>
      </dl>
    </div>
  )
}
