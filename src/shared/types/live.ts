export interface LiveSourceConfig {
  id: string
  name: string
  url: string
  createdAt: number
  updatedAt: number
}

export interface LiveChannelStream {
  id: string
  name: string
  url: string
}

export interface LiveChannel {
  id: string
  title: string
  group: string
  logo?: string
  tvgName?: string
  epgUrl?: string
  streams: LiveChannelStream[]
}

export interface LivePlaylist {
  sourceUrl: string
  fetchedAt: number
  channels: LiveChannel[]
}
