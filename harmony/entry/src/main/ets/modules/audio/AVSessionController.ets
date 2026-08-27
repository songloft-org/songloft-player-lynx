import { avSession } from '@kit.AVSessionKit'
import { common } from '@kit.AbilityKit'
import { SongloftAudioEngine } from './SongloftAudioEngine'

export type SessionCommandCallback = (command: string, args?: Record<string, Object>) => void

/**
 * AVSession integration — media session for lock screen / control center.
 *
 * HarmonyOS requires AVSession for:
 * 1. Showing playback in the system control center
 * 2. Receiving remote commands (play/pause/next/prev/seek)
 * 3. Keeping audio alive in background (paired with long-running task)
 */
export class AVSessionController {
  private session: avSession.AVSession | null = null
  private context: common.UIAbilityContext
  onCommand: SessionCommandCallback = () => {}

  constructor(context: common.UIAbilityContext) {
    this.context = context
  }

  async create(): Promise<void> {
    this.session = await avSession.createAVSession(this.context, 'SongloftAudio', 'audio')
    await this.session.activate()
    this.registerCommands()
  }

  async destroy(): Promise<void> {
    await this.session?.deactivate()
    await this.session?.destroy()
    this.session = null
  }

  async updateMetadata(title: string, artist: string, album: string,
    durationMs: number, coverUrl: string): Promise<void> {
    if (!this.session) return
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

    const playbackState: avSession.AVPlaybackState = {
      state: avState,
      position: {
        elapsedTime: positionMs,
        updateTime: Date.now(),
      },
      speed: speed,
    }
    await this.session.setAVPlaybackState(playbackState)
  }

  private registerCommands(): void {
    if (!this.session) return

    this.session.on('play', () => {
      this.onCommand('play')
    })
    this.session.on('pause', () => {
      this.onCommand('pause')
    })
    this.session.on('stop', () => {
      this.onCommand('stop')
    })
    this.session.on('playNext', () => {
      this.onCommand('next')
    })
    this.session.on('playPrevious', () => {
      this.onCommand('previous')
    })
    this.session.on('seek', (time: number) => {
      this.onCommand('seek', { position: time })
    })
    this.session.on('setSpeed', (speed: number) => {
      this.onCommand('setSpeed', { speed: speed })
    })
  }
}
