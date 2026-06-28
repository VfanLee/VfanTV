export function formatBitrate(bps: number | null | undefined): string {
  if (bps == null || !Number.isFinite(bps) || bps <= 0) {
    return '—'
  }

  if (bps >= 1_000_000) {
    return `${(bps / 1_000_000).toFixed(1)} Mbps`
  }

  return `${Math.round(bps / 1000)} Kbps`
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) {
    return '—'
  }

  if (bytes < 1024) {
    return `${Math.round(bytes)} B`
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatResolution(width: number, height: number, fps?: number | null): string {
  if (width <= 0 || height <= 0) {
    return '—'
  }

  const base = `${width}×${height}`
  if (fps != null && Number.isFinite(fps) && fps > 0) {
    return `${base}@${Math.round(fps)}`
  }

  return base
}

export function formatClarity(height: number): string {
  if (height <= 0) {
    return '—'
  }

  return `${height}P`
}

export function formatStatsTimestamp(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

export function formatBufferSeconds(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return '—'
  }

  return `${seconds.toFixed(2)} s`
}

export function formatLatencySeconds(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return '—'
  }

  return `${seconds.toFixed(1)} s`
}

export function formatPlaybackUrlForDisplay(src: string): string {
  if (!src) {
    return src
  }

  try {
    const parsed = new URL(src)
    const proxiedUrl = parsed.searchParams.get('url')
    if (proxiedUrl && parsed.pathname.endsWith('/media')) {
      return decodePlaybackUrl(proxiedUrl)
    }

    return decodePlaybackUrl(src)
  } catch {
    return decodePlaybackUrl(src)
  }
}

function decodePlaybackUrl(value: string): string {
  try {
    return decodeURI(value.trim())
  } catch {
    return value
  }
}
