import { avSession } from '@kit.AVSessionKit'
import { common } from '@kit.AbilityKit'
import { ClientFileLog } from '../platform/ClientFileLog'

export type SessionCommandCallback = (command: string) => void

export class AVSessionController {
  private session: avSession.AVSession | null = null
  private context: common.UIAbilityContext
  onCommand: SessionCommandCallback = () => {}

  constructor(context: common.UIAbilityContext) {
    this.context = context
  }

  async create(): Promise<void> {
    try {
      this.session = await avSession.createAVSession(this.context, 'SongloftAudio', 'audio')
      await this.session.activate()
      this.registerCommands()
      ClientFileLog.write('I', 'audio-svc', 'avsession created + activated')
    } catch (err) {
      ClientFileLog.write('E', 'audio-svc', `avsession create failed: ${String(err)}`)
      throw new Error(String(err))
    }
  }

  async destroy(): Promise<void> {
    await this.session?.deactivate()
    await this.session?.destroy()
    this.session = null
  }

  async updateMetadata(title: string, artist: string, album: string,
    durationMs: number, coverUrl: string): Promise<void> {
    if (!this.session) return
    ClientFileLog.write('I', 'audio-svc',
      `metadata title=${ClientFileLog.truncText(title)} artist=${ClientFileLog.truncText(artist)}`)
    const metadata: avSession.AVMetadata = {
      assetId: title,
      title: title,
      artist: artist,
      album: album,
      duration: durationMs,
      mediaImage: coverUrl,
    }
    await this.session.setAVMetadata(metadata)
  }

  async updatePlaybackState(state: 'playing' | 'paused' | 'stopped',
    positionMs: number, speed: number): Promise<void> {
    if (!this.session) return

    let avState: avSession.PlaybackState
    switch (state) {
      case 'playing':
        avState = avSession.PlaybackState.PLAYBACK_STATE_PLAY
        break
      case 'paused':
        avState = avSession.PlaybackState.PLAYBACK_STATE_PAUSE
        break
      default:
        avState = avSession.PlaybackState.PLAYBACK_STATE_STOP
    }

    const position: avSession.PlaybackPosition = {
      elapsedTime: positionMs,
      updateTime: Date.now(),
    }
    const playbackState: avSession.AVPlaybackState = {
      state: avState,
      position: position,
      speed: speed,
    }
    ClientFileLog.write('I', 'audio-svc', `playbackState=${state} pos=${Math.round(positionMs)}`)
    await this.session.setAVPlaybackState(playbackState)
  }

  private registerCommands(): void {
    if (!this.session) return

    this.session.on('play', () => { this.onCommand('play') })
    this.session.on('pause', () => { this.onCommand('pause') })
    this.session.on('stop', () => { this.onCommand('stop') })
    this.session.on('playNext', () => { this.onCommand('next') })
    this.session.on('playPrevious', () => { this.onCommand('previous') })
    this.session.on('seek', (time: number) => { this.onCommand('seek') })
    this.session.on('setSpeed', (speed: number) => { this.onCommand('setSpeed') })
  }
}
