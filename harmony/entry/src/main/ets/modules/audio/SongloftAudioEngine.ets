import { media } from '@kit.MediaKit'
import { audio } from '@kit.AudioKit'

export type AudioStateCallback = (state: string) => void
export type AudioProgressCallback = (positionMs: number, durationMs: number) => void
export type AudioErrorCallback = (code: number, message: string) => void
export type AudioTrackEndCallback = () => void

/**
 * AVPlayer wrapper — single shared player instance.
 *
 * Design mirrors Android's SongloftAudioEngine (ExoPlayer wrapper):
 * - One player instance shared across playback and video surface
 * - Events forwarded to registered callbacks
 * - Volume/speed/seek are immediate imperative calls
 */
export class SongloftAudioEngine {
  private static instance: SongloftAudioEngine | null = null
  private avPlayer: media.AVPlayer | null = null
  private progressTimer: number = -1
  private currentUrl: string = ''
  private prepared: boolean = false

  onStateChange: AudioStateCallback = () => {}
  onProgress: AudioProgressCallback = () => {}
  onError: AudioErrorCallback = () => {}
  onTrackEnd: AudioTrackEndCallback = () => {}

  static async getInstance(): Promise<SongloftAudioEngine> {
    if (!SongloftAudioEngine.instance) {
      SongloftAudioEngine.instance = new SongloftAudioEngine()
      await SongloftAudioEngine.instance.init()
    }
    return SongloftAudioEngine.instance
  }

  static release(): void {
    SongloftAudioEngine.instance?.destroy()
    SongloftAudioEngine.instance = null
  }

  private async init(): Promise<void> {
    this.avPlayer = await media.createAVPlayer()
    this.registerCallbacks()
  }

  private registerCallbacks(): void {
    if (!this.avPlayer) return

    this.avPlayer.on('stateChange', (state: string, reason: media.StateChangeReason) => {
      switch (state) {
        case 'idle':
          this.onStateChange('idle')
          break
        case 'initialized':
          this.avPlayer?.prepare()
          break
        case 'prepared':
          this.prepared = true
          this.onStateChange('ready')
          break
        case 'playing':
          this.startProgressTimer()
          this.onStateChange('playing')
          break
        case 'paused':
          this.stopProgressTimer()
          this.onStateChange('paused')
          break
        case 'stopped':
          this.stopProgressTimer()
          break
        case 'completed':
          this.stopProgressTimer()
          this.onStateChange('completed')
          this.onTrackEnd()
          break
        case 'released':
          break
        case 'error':
          this.onStateChange('error')
          break
      }
    })

    this.avPlayer.on('error', (err) => {
      this.onError(err.code, err.message)
    })

    this.avPlayer.on('durationUpdate', (duration: number) => {
      this.onProgress(this.avPlayer?.currentTime ?? 0, duration)
    })

    this.avPlayer.on('seekDone', (seekTime: number) => {
      this.onProgress(seekTime, this.avPlayer?.duration ?? 0)
    })
  }

  async play(url: string, startMs: number): Promise<void> {
    if (!this.avPlayer) return
    this.prepared = false
    this.currentUrl = url
    this.onStateChange('loading')

    await this.avPlayer.reset()
    this.avPlayer.url = url

    // Wait for prepared state, then seek and play
    const waitForPrepared = (): Promise<void> => {
      return new Promise((resolve) => {
        const originalCallback = this.onStateChange
        this.onStateChange = (state: string) => {
          originalCallback(state)
          if (state === 'ready') {
            this.onStateChange = originalCallback
            resolve()
          }
        }
      })
    }

    await waitForPrepared()
    if (startMs > 0) {
      this.avPlayer.seek(startMs)
    }
    await this.avPlayer.play()
  }

  async resume(): Promise<void> {
    await this.avPlayer?.play()
  }

  async pause(): Promise<void> {
    await this.avPlayer?.pause()
  }

  async stop(): Promise<void> {
    this.stopProgressTimer()
    await this.avPlayer?.stop()
  }

  async seek(positionMs: number): Promise<void> {
    this.avPlayer?.seek(positionMs)
  }

  setVolume(volume: number): void {
    // volume: 0-1 float (converted from 0-100 by store layer)
    this.avPlayer?.setVolume(volume)
  }

  setSpeed(speed: number): void {
    if (!this.avPlayer) return
    // AVPlayer speed mapping
    const speedMode = this.mapSpeed(speed)
    this.avPlayer.setSpeed(speedMode)
  }

  getPosition(): number {
    return this.avPlayer?.currentTime ?? 0
  }

  getDuration(): number {
    return this.avPlayer?.duration ?? 0
  }

  isPlaying(): boolean {
    return this.avPlayer?.state === 'playing'
  }

  private mapSpeed(speed: number): media.PlaybackSpeed {
    if (speed <= 0.5) return media.PlaybackSpeed.SPEED_FORWARD_0_50_X
    if (speed <= 0.75) return media.PlaybackSpeed.SPEED_FORWARD_0_75_X
    if (speed <= 1.0) return media.PlaybackSpeed.SPEED_FORWARD_1_00_X
    if (speed <= 1.25) return media.PlaybackSpeed.SPEED_FORWARD_1_25_X
    if (speed <= 1.5) return media.PlaybackSpeed.SPEED_FORWARD_1_50_X
    if (speed <= 1.75) return media.PlaybackSpeed.SPEED_FORWARD_1_75_X
    return media.PlaybackSpeed.SPEED_FORWARD_2_00_X
  }

  private startProgressTimer(): void {
    this.stopProgressTimer()
    this.progressTimer = setInterval(() => {
      if (this.avPlayer && this.avPlayer.state === 'playing') {
        this.onProgress(this.avPlayer.currentTime, this.avPlayer.duration)
      }
    }, 500)
  }

  private stopProgressTimer(): void {
    if (this.progressTimer >= 0) {
      clearInterval(this.progressTimer)
      this.progressTimer = -1
    }
  }

  private destroy(): void {
    this.stopProgressTimer()
    this.avPlayer?.release()
    this.avPlayer = null
  }
}
