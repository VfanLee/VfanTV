import type Player from 'video.js/dist/types/player'
import { getVfanContext } from './player-context'

const SEEK_STEP_STORAGE_KEY = 'vfan-player-seek-step'
const DEFAULT_SEEK_STEP_SECONDS = 5
const VOLUME_STEP = 0.1

export function createHotkeysHandler(): (this: Player, event: KeyboardEvent) => void {
  return function handleHotkey(this: Player, event: KeyboardEvent): void {
    const target = event.target
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return
    }

    switch (event.key) {
      case ' ':
      case 'Spacebar':
        event.preventDefault()
        if (this.paused()) {
          void this.play()
        } else {
          this.pause()
        }
        break
      case 'ArrowUp':
        event.preventDefault()
        this.volume(Math.min(1, (this.volume() ?? 0) + VOLUME_STEP))
        break
      case 'ArrowDown':
        event.preventDefault()
        this.volume(Math.max(0, (this.volume() ?? 0) - VOLUME_STEP))
        break
      case 'ArrowLeft':
        if (!getVfanContext(this)?.keyboardSeek) return
        event.preventDefault()
        this.currentTime(Math.max(0, (this.currentTime() ?? 0) - readSeekStepSeconds()))
        break
      case 'ArrowRight':
        if (!getVfanContext(this)?.keyboardSeek) return
        event.preventDefault()
        this.currentTime((this.currentTime() ?? 0) + readSeekStepSeconds())
        break
      case 'f':
      case 'F':
        event.preventDefault()
        if (this.isFullscreen()) {
          this.exitFullscreen()
        } else {
          void this.requestFullscreen()
        }
        break
      case 'm':
      case 'M':
        event.preventDefault()
        this.muted(!this.muted())
        break
      default:
        break
    }
  }
}

function readSeekStepSeconds(): number {
  const stored = window.localStorage.getItem(SEEK_STEP_STORAGE_KEY)
  if (stored === null) {
    return DEFAULT_SEEK_STEP_SECONDS
  }

  const value = Number(stored)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_SEEK_STEP_SECONDS
}
