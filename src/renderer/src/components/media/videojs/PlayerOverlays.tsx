import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type Player from 'video.js/dist/types/player'
import { PlayerErrorLogDialog } from '../player/PlayerDialogs'
import { PlayerStatsOverlay } from '../player/PlayerStatsOverlay'
import type { HlsSessionStats, PlayerErrorLog } from '../player/types'
import { useVideoJsStats } from './useVideoJsStats'

interface PlayerOverlaysProps {
  errorLogOpen: boolean
  errorLogs: PlayerErrorLog[]
  hlsSessionStats: HlsSessionStats
  playerRef: React.RefObject<Player | null>
  seekStepSeconds: number
  settingsOpen: boolean
  src: string
  statsOpen: boolean
  onCloseErrorLogs: () => void
  onCloseStats: () => void
  onCloseSettings: () => void
  onSeekStepChange: (seconds: number) => void
}

export function PlayerOverlays({
  errorLogOpen,
  errorLogs,
  hlsSessionStats,
  onCloseErrorLogs,
  onCloseStats,
  onCloseSettings,
  onSeekStepChange,
  playerRef,
  seekStepSeconds,
  settingsOpen,
  src,
  statsOpen,
}: PlayerOverlaysProps): React.JSX.Element | null {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null)
  const stats = useVideoJsStats({ enabled: statsOpen, hlsSessionStats, playerRef, src })

  useEffect(() => {
    const player = playerRef.current
    if (!player || player.isDisposed()) {
      setMountNode(null)
      return
    }

    setMountNode(player.el() as HTMLElement)
    const onDispose = (): void => setMountNode(null)
    player.on('dispose', onDispose)
    return () => {
      player.off('dispose', onDispose)
    }
  }, [playerRef])

  if (!mountNode) {
    return null
  }

  return createPortal(
    <>
      {statsOpen ? <PlayerStatsOverlay open stats={stats} onClose={onCloseStats} /> : null}
      {errorLogOpen ? <PlayerErrorLogDialog logs={errorLogs} onClose={onCloseErrorLogs} /> : null}
      {settingsOpen ? (
        <PlayerSettingsOverlay
          seekStepSeconds={seekStepSeconds}
          onClose={onCloseSettings}
          onSeekStepChange={onSeekStepChange}
        />
      ) : null}
    </>,
    mountNode,
  )
}

const SEEK_STEP_OPTIONS = [5, 10, 15, 30] as const
function PlayerSettingsOverlay({
  seekStepSeconds,
  onClose,
  onSeekStepChange,
}: {
  seekStepSeconds: number
  onClose: () => void
  onSeekStepChange: (seconds: number) => void
}): React.JSX.Element {
  return (
    <div
      aria-label="播放设置"
      className="pointer-events-auto absolute right-3 bottom-16 z-25 w-[260px] rounded-lg border border-white/10 bg-black/82 p-3 text-white shadow-xl shadow-black/40 backdrop-blur-sm"
      role="dialog"
    >
      <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-2">
        <span className="text-xs font-semibold text-white/95">播放设置</span>
        <button
          className="rounded px-2 py-1 text-xs text-white/65 hover:bg-white/10 hover:text-white"
          type="button"
          onClick={onClose}
        >
          关闭
        </button>
      </div>
      <SettingGroup label="快退 / 快进步长">
        {SEEK_STEP_OPTIONS.map((seconds) => (
          <button
            key={seconds}
            className={seconds === seekStepSeconds ? 'vfantv-setting-pill is-active' : 'vfantv-setting-pill'}
            type="button"
            onClick={() => onSeekStepChange(seconds)}
          >
            {seconds}s
          </button>
        ))}
      </SettingGroup>
    </div>
  )
}

function SettingGroup({ children, label }: { children: React.ReactNode; label: string }): React.JSX.Element {
  return (
    <div className="mb-3 last:mb-0">
      <div className="mb-2 text-[11px] font-semibold text-white/55">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}
