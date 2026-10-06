import { media } from '@kit.MediaKit'
import { audio } from '@kit.AudioKit'
import { LocalAudioSource } from './LocalAudioSource'

export type AudioStateCallback = (state: string) => void
export type AudioProgressCallback = (positionMs: number, durationMs: number) => void
export type AudioErrorCallback = (code: number, message: string) => void
export type AudioTrackEndCallback = () => void
export type VideoSizeCallback = (width: number, height: number) => void

/**
 * Why the video screen could or could not get a picture.
 *
 * Mirrors `SongloftAudioEngine.VideoTrackState` on Android/iOS: `noTrack` and
 * `failed` must stay distinct so a transcode failure is not misreported as
 * "this file has no video track".
 */
export enum VideoTrackState {
  HAS_TRACK = 'hasTrack',
  NO_TRACK = 'noTrack',
  FAILED = 'failed',
  LOADING = 'loading',
}

/**
 * AVPlayer wrapper — single shared player instance.
 *
 * Design mirrors Android's SongloftAudioEngine (ExoPlayer wrapper):
 * - One player instance shared across playback and video surface
 * - Events forwarded to registered callbacks
 * - Volume/speed/seek are immediate imperative calls
 */
export class SongloftAudioEngine {
  private loadGeneration: number = 0
  private loadSerial: Promise<void> = Promise.resolve()
  private resetting: boolean = false
  private sourceId: string = ''
  private initialPositionMs: number = 0
  private desiredPlay: boolean = false
  private sourceReadyPending: boolean = false
  private initialSeekPending: boolean = false
  private volume: number = 1
  private speed: number = 1
  onSourceReady: (sourceId: string, positionMs: number) => void = () => {}

  getSourceId(): string { return this.sourceId }
  private static instance: SongloftAudioEngine | null = null
  private avPlayer: media.AVPlayer | null = null
  private progressTimer: number = -1
  private currentUrl: string = ''
  private localSource: LocalAudioSource = new LocalAudioSource()
  private prepared: boolean = false
  /** Surface id pushed by the video module; applied in the `initialized` transition. */
  private pendingSurfaceId: string = ''

  onStateChange: AudioStateCallback = () => {}
  onProgress: AudioProgressCallback = () => {}
  onError: AudioErrorCallback = () => {}
  onTrackEnd: AudioTrackEndCallback = () => {}

  /** Set by [attachVideoOutput]; cleared by [detachVideoOutput]. */
  private videoSizeCallback: VideoSizeCallback | null = null
  private videoWidth: number = 0
  private videoHeight: number = 0
  private videoOutputAttached: boolean = false
  /** Item status inferred from the state machine — same three-way as iOS/Android. */
  private itemFailed: boolean = false
  private itemReady: boolean = false

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
      if (this.resetting) return
      switch (state) {
        case 'idle':
          this.itemReady = false
          this.itemFailed = false
          this.onStateChange('idle')
          break
        case 'initialized':
          // Bind the video surface **before** `prepare()` — AVPlayer does not
          // pick up a surfaceId set after preparation, so a late-attached video
          // screen has to wait for the next `reset() → surfaceId → prepare()`
          // cycle (the same rule Android has for `setVideoSurface`).
          if (this.videoOutputAttached && this.pendingSurfaceId.length > 0 && this.avPlayer) {
            this.avPlayer.surfaceId = this.pendingSurfaceId
          }
          this.avPlayer?.prepare()
          break
        case 'prepared':
          this.prepared = true
          this.itemReady = true
          this.onStateChange('ready')
          if (this.sourceReadyPending) {
            this.avPlayer?.setVolume(this.volume)
            this.setSpeed(this.speed)
            if (this.initialPositionMs > 0) {
              this.initialSeekPending = true
              const duration = this.avPlayer?.duration ?? 0
              this.avPlayer?.seek(duration > 0 ? Math.min(this.initialPositionMs, duration) : this.initialPositionMs)
            } else {
              this.finishSourceLoad()
            }
          }
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
          this.itemFailed = true
          this.onStateChange('error')
          break
      }
    })

    // AVPlayer fires this once the decoder produces its first frame. Same
    // channel Android reads through `Player.Listener.onVideoSizeChanged` and
    // iOS through KVO on `AVPlayerItem.presentationSize`.
    this.avPlayer.on('videoSizeChange', (width: number, height: number) => {
      if (width <= 0 || height <= 0) return
      this.videoWidth = width
      this.videoHeight = height
      this.videoSizeCallback?.(width, height)
    })

    this.avPlayer.on('error', (err) => {
      this.onError(err.code, err.message)
    })

    this.avPlayer.on('durationUpdate', (duration: number) => {
      this.onProgress(this.avPlayer?.currentTime ?? 0, duration)
    })

    this.avPlayer.on('seekDone', (seekTime: number) => {
      this.onProgress(seekTime, this.avPlayer?.duration ?? 0)
      if (this.initialSeekPending) this.finishSourceLoad()
    })
  }

  private finishSourceLoad(): void {
    if (!this.sourceReadyPending) return
    this.sourceReadyPending = false
    this.initialSeekPending = false
    const generation = this.loadGeneration
    const sourceId = this.sourceId
    const intent = this.desiredPlay ? this.avPlayer?.play() : Promise.resolve()
    intent?.then(() => {
      if (generation !== this.loadGeneration) return
      this.onSourceReady(sourceId, this.avPlayer?.currentTime ?? 0)
    }).catch((err: Error) => {
      if (generation === this.loadGeneration) this.onError(-1, err.message)
    })
  }

  load(url: string, startMs: number, autoplay: boolean, sourceId: string): Promise<void> {
    const generation = ++this.loadGeneration
    this.sourceReadyPending = false
    this.initialSeekPending = false
    this.stopProgressTimer()
    // Serialize resets, but do not wait for preparation: a new request must
    // supersede an unreachable source without waiting for its network timeout.
    this.loadSerial = this.loadSerial.catch(() => {}).then(async () => {
      if (generation !== this.loadGeneration || !this.avPlayer) return
      this.resetting = true
      try {
        await this.avPlayer.reset()
      } finally {
        this.resetting = false
      }
      if (generation !== this.loadGeneration) return
      this.sourceId = sourceId
      this.initialPositionMs = Math.max(0, startMs)
      this.desiredPlay = autoplay
      this.sourceReadyPending = sourceId.length > 0
      this.prepared = false
      this.itemReady = false
      this.itemFailed = false
      this.currentUrl = url
      this.onStateChange('loading')
      this.localSource.assign(this.avPlayer, url)
    })
    return this.loadSerial
  }

  async play(url: string, startMs: number): Promise<void> {
    if (!this.avPlayer) return
    ++this.loadGeneration
    this.sourceId = ''
    this.sourceReadyPending = false
    this.initialSeekPending = false
    this.prepared = false
    this.itemReady = false
    this.itemFailed = false
    this.videoWidth = 0
    this.videoHeight = 0
    this.currentUrl = url
    this.onStateChange('loading')

    await this.avPlayer.reset()
    this.localSource.assign(this.avPlayer, url)

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
    this.desiredPlay = true
    if (this.sourceReadyPending) return
    await this.avPlayer?.play()
  }

  async pause(): Promise<void> {
    this.desiredPlay = false
    if (this.sourceReadyPending) return
    await this.avPlayer?.pause()
  }

  async stop(): Promise<void> {
    ++this.loadGeneration
    this.sourceReadyPending = false
    this.initialSeekPending = false
    this.stopProgressTimer()
    await this.avPlayer?.stop()
  }

  async seek(positionMs: number): Promise<void> {
    this.avPlayer?.seek(positionMs)
  }

  setVolume(volume: number): void {
    this.volume = volume
    // volume: 0-1 float (converted from 0-100 by store layer)
    this.avPlayer?.setVolume(volume)
  }

  setSpeed(speed: number): void {
    this.speed = speed
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

  // MARK: - Video output

  /**
   * Bind the decoder output to `surfaceId` and register a size callback.
   *
   * AVPlayer only accepts a `surfaceId` while in the `initialized` state (before
   * `prepare()`), so a late attach — user opens the video screen after the audio
   * player is already playing — must reset the pipeline. Same rule as Android,
   * whose `setVideoSurface` needs an equivalent `player.setVideoSurface(view)`
   * before decoding a frame.
   */
  async attachVideoOutput(surfaceId: string, onVideoSize: VideoSizeCallback | null): Promise<void> {
    this.videoOutputAttached = true
    this.videoSizeCallback = onVideoSize
    this.pendingSurfaceId = surfaceId

    if (!this.avPlayer) return
    if (this.avPlayer.state === 'initialized') {
      this.avPlayer.surfaceId = surfaceId
      return
    }
    if (this.avPlayer.state === 'prepared' || this.avPlayer.state === 'playing'
      || this.avPlayer.state === 'paused' || this.avPlayer.state === 'completed') {
      // Re-prepare with the surface bound. Retain the current url + position so
      // the audio does not jump — same trick Android uses when swapping the
      // SurfaceView underneath ExoPlayer.
      const url = this.currentUrl
      const position = this.avPlayer.currentTime
      if (url.length === 0) return
      await this.avPlayer.reset()
      this.localSource.assign(this.avPlayer, url)
      // `initialized` transition (above) will pick up `pendingSurfaceId` and
      // then trigger prepare(); on `ready`, re-seek and resume.
      const seekAfterReady = (state: string): void => {
        if (state === 'ready' && position > 0) {
          this.avPlayer?.seek(position)
        }
      }
      const prevOn = this.onStateChange
      this.onStateChange = (state: string): void => {
        prevOn(state)
        seekAfterReady(state)
      }
    }

    if (this.videoWidth > 0 && this.videoHeight > 0) {
      // Replay the last-known size — a page that opened the video screen
      // *after* the first frame decoded would otherwise never learn the
      // aspect ratio and could not compute the letterbox rect.
      onVideoSize?.(this.videoWidth, this.videoHeight)
    }
  }

  detachVideoOutput(): void {
    this.videoOutputAttached = false
    this.videoSizeCallback = null
    this.pendingSurfaceId = ''
    // Leaving `avPlayer.surfaceId` set is harmless — the decoder just draws
    // into a hidden XComponent — and clearing it here would fault the running
    // stream. The XComponent host handles visibility.
  }

  hasVideoTrack(): boolean {
    return this.videoWidth > 0 && this.videoHeight > 0
  }

  /**
   * Three-way `HAS_TRACK / NO_TRACK / FAILED / LOADING`, same vocabulary as
   * Android / iOS. `videoSizeChange` fires for any stream that carries a
   * decodable picture — a genuinely audio-only file simply never fires it, so
   * `NO_TRACK` is the "ready-but-no-size" branch.
   */
  videoTrackState(): VideoTrackState {
    if (this.itemFailed) return VideoTrackState.FAILED
    if (!this.itemReady) return VideoTrackState.LOADING
    return this.hasVideoTrack() ? VideoTrackState.HAS_TRACK : VideoTrackState.NO_TRACK
  }

  currentVideoSize(): [number, number] | null {
    if (this.videoWidth <= 0 || this.videoHeight <= 0) return null
    return [this.videoWidth, this.videoHeight]
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
    const player = this.avPlayer
    this.avPlayer = null
    if (player) void player.release().finally(() => this.localSource.close()).catch(() => {})
    else this.localSource.close()
  }
}
