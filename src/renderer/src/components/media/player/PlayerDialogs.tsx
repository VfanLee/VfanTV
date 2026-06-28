import { X } from 'lucide-react'
import type { PlayerErrorLog } from './types'

export function PlayerErrorLogDialog({
  logs,
  onClose,
}: {
  logs: PlayerErrorLog[]
  onClose: () => void
}): React.JSX.Element {
  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div
        aria-labelledby="player-error-log-title"
        aria-modal="true"
        className="flex max-h-[70vh] w-full max-w-2xl flex-col rounded-xl border border-white/10 bg-black/90 p-4 text-white shadow-2xl shadow-black/45 backdrop-blur-2xl"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-white/95" id="player-error-log-title">
              错误日志
            </h2>
          </div>
          <DialogCloseButton label="关闭错误日志" onClick={onClose} />
        </div>

        {logs.length > 0 ? (
          <div className="mt-4 min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10">
            {[...logs].reverse().map((log) => (
              <div key={log.id} className="border-b border-white/10 px-3 py-3 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className={log.fatal ? 'text-white' : 'text-white/60'}>{log.fatal ? '严重' : '可恢复'}</span>
                  <span className="text-white/90">{log.source}</span>
                  <time className="ml-auto text-white/55">{formatLogTime(log.timestamp)}</time>
                </div>
                <p className="mt-2 font-mono text-xs leading-5 break-words text-white/72">{log.message}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 flex h-36 items-center justify-center rounded-xl border border-dashed border-white/15 text-sm text-white/55">
            无错误日志
          </div>
        )}
      </div>
    </div>
  )
}

function DialogCloseButton({ label, onClick }: { label: string; onClick: () => void }): React.JSX.Element {
  return (
    <button
      aria-label={label}
      className="inline-flex size-7 items-center justify-center rounded-xl text-white/65 transition-colors hover:text-white"
      type="button"
      onClick={onClick}
    >
      <X size={15} />
    </button>
  )
}

function formatLogTime(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(timestamp)
}
