import { avSession } from '@kit.AVSessionKit'
import { common } from '@kit.AbilityKit'
import { ClientFileLog } from '../platform/ClientFileLog'

export type SessionCommandCallback = (command: string, value?: number) => void

export interface SessionMetadata {
  assetId: string
  title: string
  artist: string
  album: string
  durationMs: number
  coverUrl: string
}

export class AVSessionController {
  private session: avSession.AVSession | null = null
  private context: common.UIAbilityContext
  private metadata: SessionMetadata = { assetId: 'songloft', title: '', artist: '', album: '', durationMs: 0, coverUrl: '' }
  private lyric: string | null = null
  private inTitle: boolean = true
  private state: string = 'idle'
  private positionMs: number = 0
  private speed: number = 1
  private favorite: boolean = false
  private repeatMode: string = 'off'
  private shuffle: boolean = false
  private writes: Promise<void> = Promise.resolve()
  onCommand: SessionCommandCallback = () => {}

  constructor(context: common.UIAbilityContext) {
    this.context = context
  }

  async create(): Promise<void> {
    try {
      this.session = await avSession.createAVSession(this.context, 'SongloftAudio', 'audio')
      await this.session.activate()
      this.registerCommands()
      await this.publishMetadata()
      await this.publishPlaybackState()
      ClientFileLog.write('I', 'audio-svc', 'avsession created + activated')
    } catch (err) {
      ClientFileLog.write('E', 'audio-svc', `avsession create failed: ${String(err)}`)
      await this.destroy().catch((): void => {})
      throw new Error(String(err))
    }
  }

  async destroy(): Promise<void> {
    const session = this.session
    this.session = null
    if (!session) return
    try { await session.deactivate() }
    finally { await session.destroy() }
  }

  updateMetadata(metadata: SessionMetadata): Promise<void> {
    if (metadata.assetId !== this.metadata.assetId) {
      this.lyric = null
      this.favorite = false
    }
    this.metadata = { assetId: metadata.assetId, title: metadata.title, artist: metadata.artist,
      album: metadata.album, durationMs: metadata.durationMs, coverUrl: metadata.coverUrl }
    ClientFileLog.write('I', 'audio-svc',
      `metadata title=${ClientFileLog.truncText(metadata.title)} artist=${ClientFileLog.truncText(metadata.artist)}`)
    return this.publishMetadata()
  }

  updateDuration(durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs === this.metadata.durationMs) return
    this.metadata.durationMs = durationMs
    this.publishMetadata()
  }

  updateLyric(lyric: string | null, inTitle: boolean): void {
    this.lyric = lyric !== null && lyric.trim().length > 0 ? lyric : null
    this.inTitle = inTitle
    this.publishMetadata()
  }

  setFavorite(favorite: boolean): void {
    this.favorite = favorite
    this.publishPlaybackState()
  }

  setRepeatMode(mode: string): void {
    this.repeatMode = mode
    this.publishPlaybackState()
  }

  setShuffle(shuffle: boolean): void {
    this.shuffle = shuffle
    this.publishPlaybackState()
  }

  private publishMetadata(): Promise<void> {
    const metadata: avSession.AVMetadata = {
      assetId: this.metadata.assetId,
      title: this.lyric !== null && this.inTitle ? this.lyric : this.metadata.title,
      subtitle: this.lyric === null ? '' : this.inTitle ? this.metadata.title : this.lyric,
      artist: this.metadata.artist,
      album: this.metadata.album,
      duration: this.metadata.durationMs,
      mediaImage: this.metadata.coverUrl,
    }
    return this.enqueue((session: avSession.AVSession): Promise<void> => session.setAVMetadata(metadata))
  }

  updatePlaybackState(state: string,
    positionMs: number, speed: number): Promise<void> {
    this.state = state
    this.positionMs = positionMs
    this.speed = speed
    return this.publishPlaybackState()
  }

  private publishPlaybackState(): Promise<void> {
    let avState: avSession.PlaybackState
    switch (this.state) {
      case 'playing':
        avState = avSession.PlaybackState.PLAYBACK_STATE_PLAY
        break
      case 'paused':
      case 'ready':
        avState = avSession.PlaybackState.PLAYBACK_STATE_PAUSE
        break
      case 'loading':
        avState = avSession.PlaybackState.PLAYBACK_STATE_PREPARE
        break
      case 'completed':
        avState = avSession.PlaybackState.PLAYBACK_STATE_COMPLETED
        break
      case 'error':
        avState = avSession.PlaybackState.PLAYBACK_STATE_ERROR
        break
      case 'idle':
        avState = avSession.PlaybackState.PLAYBACK_STATE_IDLE
        break
      default:
        avState = avSession.PlaybackState.PLAYBACK_STATE_STOP
    }

    const position: avSession.PlaybackPosition = {
      elapsedTime: this.positionMs,
      updateTime: Date.now(),
    }
    const playbackState: avSession.AVPlaybackState = {
      state: avState,
      position: position,
      speed: this.speed,
      isFavorite: this.favorite,
      loopMode: this.shuffle ? avSession.LoopMode.LOOP_MODE_SHUFFLE
        : this.repeatMode === 'one' ? avSession.LoopMode.LOOP_MODE_SINGLE
          : this.repeatMode === 'all' ? avSession.LoopMode.LOOP_MODE_LIST : avSession.LoopMode.LOOP_MODE_SEQUENCE,
    }
    return this.enqueue((session: avSession.AVSession): Promise<void> => session.setAVPlaybackState(playbackState))
  }

  /** Serialize snapshots so an older delayed SDK write cannot overwrite a newer track/lyric. */
  private enqueue(write: (session: avSession.AVSession) => Promise<void>): Promise<void> {
    const session = this.session
    if (!session) return Promise.resolve()
    this.writes = this.writes.then(async (): Promise<void> => {
      if (this.session === session) await write(session)
    }).catch((error: Error): void => {
      ClientFileLog.write('E', 'audio-svc', `avsession update failed: ${String(error)}`)
    })
    return this.writes
  }

  private registerCommands(): void {
    if (!this.session) return

    this.session.on('play', () => { this.onCommand('play') })
    this.session.on('pause', () => { this.onCommand('pause') })
    this.session.on('stop', () => { this.onCommand('stop') })
    this.session.on('playNext', () => { this.onCommand('next') })
    this.session.on('playPrevious', () => { this.onCommand('previous') })
    this.session.on('seek', (time: number) => { this.onCommand('seek', time) })
    this.session.on('setSpeed', (speed: number) => { this.onCommand('setSpeed', speed) })
    this.session.on('toggleFavorite', (assetId: string) => {
      if (assetId === this.metadata.assetId) this.onCommand('toggleFavorite')
    })
  }
}
