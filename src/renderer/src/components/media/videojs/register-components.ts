import videojs from 'video.js'
import type Component from 'video.js/dist/types/component'
import type Player from 'video.js/dist/types/player'
import { getVfanContext } from './player-context'

let registered = false

type ButtonConstructor = typeof Component & { new (player: Player, options?: Record<string, unknown>): Component }
type VjsButton = Component & {
  addClass: (className: string) => void
  controlText: (text: string) => void
  hide: () => void
  player: () => Player
  show: () => void
}

export function registerVfanComponents(): void {
  if (registered) {
    return
  }

  registered = true
  const Button = videojs.getComponent('Button') as ButtonConstructor

  class EpisodeNavButton extends Button {
    createEl(): Element {
      const el = videojs.dom.createEl('div', { className: 'vjs-episode-nav vjs-control' })
      const previous = videojs.dom.createEl('button', {
        className: 'vjs-episode-nav-prev vjs-control vjs-button',
        type: 'button',
        title: '上一集',
      })
      const next = videojs.dom.createEl('button', {
        className: 'vjs-episode-nav-next vjs-control vjs-button',
        type: 'button',
        title: '下一集',
      })

      previous.addEventListener('click', () => {
        const context = getVfanContext(this.player())
        if (context?.hasPreviousEpisode) {
          context.onPreviousEpisode?.()
        }
      })
      next.addEventListener('click', () => {
        const context = getVfanContext(this.player())
        if (context?.hasNextEpisode) {
          context.onNextEpisode?.()
        }
      })

      el.append(previous, next)
      return el
    }

    update(): void {
      const context = getVfanContext(this.player())
      const labels = context?.navigationLabels
      const previous = this.el().querySelector('.vjs-episode-nav-prev') as HTMLButtonElement | null
      const next = this.el().querySelector('.vjs-episode-nav-next') as HTMLButtonElement | null

      if (previous) {
        previous.disabled = !context?.hasPreviousEpisode
        previous.title = labels?.previous ?? '上一集'
      }
      if (next) {
        next.disabled = !context?.hasNextEpisode
        next.title = labels?.next ?? '下一集'
      }
    }
  }

  class LoopToggleButton extends Button {
    constructor(player: Player, options?: Record<string, unknown>) {
      super(player, options)
      ;(this as unknown as VjsButton).controlText('循环播放')
    }

    handleClick(): void {
      getVfanContext(this.player())?.onToggleLoop?.()
      this.update()
    }

    update(): void {
      const enabled = getVfanContext(this.player())?.loopEnabled ?? false
      this.el().setAttribute('aria-pressed', String(enabled))
      ;(this as unknown as VjsButton).controlText(enabled ? '关闭循环' : '开启循环')
    }

    buildCSSClass(): string {
      return `vjs-loop-toggle vjs-control vjs-button ${super.buildCSSClass()}`
    }
  }

  videojs.registerComponent('EpisodeNavButton', EpisodeNavButton)
  videojs.registerComponent('LoopToggleButton', LoopToggleButton)
  videojs.registerComponent(
    'SettingsButton',
    createActionButton(Button, 'settings', '设置', (player) => {
      getVfanContext(player)?.onToggleSettings?.()
    }),
  )
  videojs.registerComponent(
    'StatsButton',
    createActionButton(Button, 'stats', '播放统计', (player) => {
      getVfanContext(player)?.onToggleStats?.()
    }),
  )
  videojs.registerComponent(
    'RetryButton',
    createActionButton(Button, 'retry', '重试', (player) => {
      getVfanContext(player)?.onRetry?.()
    }),
  )
}

export function updateControlBar(player: Player): void {
  const controlBar = player.getChild('controlBar') as Component | undefined
  if (!controlBar) {
    return
  }

  ;['EpisodeNavButton', 'LoopToggleButton'].forEach((name) => {
    const child = controlBar.getChild(name) as (Component & { update?: () => void }) | undefined
    child?.update?.()
  })
}

function createActionButton(
  Button: ButtonConstructor,
  cssName: string,
  label: string,
  onClick: (player: Player) => void,
): ButtonConstructor {
  return class extends Button {
    constructor(player: Player, options?: Record<string, unknown>) {
      super(player, options)
      ;(this as unknown as VjsButton).controlText(label)
    }

    handleClick(): void {
      onClick(this.player())
    }

    buildCSSClass(): string {
      return `vjs-${cssName} vjs-control vjs-button ${super.buildCSSClass()}`
    }
  } as ButtonConstructor
}
