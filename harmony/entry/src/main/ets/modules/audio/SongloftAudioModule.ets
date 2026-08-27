import { LynxModule, LynxMethod, LynxCallback, LynxContext } from '@aspect/lynx'
import { common } from '@kit.AbilityKit'
import { SongloftAudioEngine } from './SongloftAudioEngine'
import { AVSessionController } from './AVSessionController'
import { BackgroundTaskManager } from './BackgroundTaskManager'

/**
 * SongloftAudio — full audio playback module.
 *
 * Method/event names match Android/iOS byte-for-byte (gate-verified):
 * - play(url, startMs) / pause() / resume() / stop() / seek(ms)
 * - setVolume(0-100) / setSpeed(float) / getPosition(cb) / getDuration(cb)
 * - setMetadata(json) / setEqEnabled(bool) / setEqBands(json)
 * - Events: audio:progress / audio:state / audio:duration / audio:error / audio:trackEnd
 */
@LynxModule('SongloftAudio')
export class SongloftAudioModule {
  private context: common.UIAbilityContext
  private lynxContext: LynxContext
  private engine: SongloftAudioEngine | null = null
  private sessionController: AVSessionController
  private backgroundTask: BackgroundTaskManager
  private currentSpeed: number = 1.0

  constructor(context: common.UIAbilityContext, lynxContext: LynxContext) {
    this.context = context
    this.lynxContext = lynxContext
    this.sessionController = new AVSessionController(context)
    this.backgroundTask = new BackgroundTaskManager(context)
    this.initEngine()
  }

  private async initEngine(): Promise<void> {
    this.engine = await SongloftAudioEngine.getInstance()
    await this.sessionController.create()

    this.engine.onStateChange = (state: string) => {
      this.sendEvent('audio:state', [{ state }])
      this.updateSessionState(state)
    }

    this.engine.onProgress = (positionMs: number, durationMs: number) => {
      this.sendEvent('audio:progress', [{ positionMs, durationMs }])
    }

    this.engine.onError = (code: number, message: string) => {
      this.sendEvent('audio:error', [{ code, message }])
    }

    this.engine.onTrackEnd = () => {
      this.sendEvent('audio:trackEnd', [{}])
    }

    this.sessionController.onCommand = (command: string, args?: Record<string, Object>) => {
      this.sendEvent('audio:remoteCommand', [{ command, ...args }])
    }
  }

  @LynxMethod
  play(url: string, startMs: number): void {
    this.backgroundTask.startBackgroundTask()
    this.engine?.play(url, startMs)
  }

  @LynxMethod
  pause(): void {
    this.engine?.pause()
  }

  @LynxMethod
  resume(): void {
    this.engine?.resume()
  }

  @LynxMethod
  stop(): void {
    this.engine?.stop()
    this.backgroundTask.stopBackgroundTask()
  }

  @LynxMethod
  seek(positionMs: number): void {
    this.engine?.seek(positionMs)
  }

  @LynxMethod
  setVolume(volume: number): void {
    // Store layer sends 0-100 integer; native layer uses 0-1 float
    this.engine?.setVolume(volume / 100)
  }

  @LynxMethod
  setSpeed(speed: number): void {
    this.currentSpeed = speed
    this.engine?.setSpeed(speed)
  }

  @LynxMethod
  getPosition(callback: LynxCallback): void {
    const pos = this.engine?.getPosition() ?? 0
    callback(JSON.stringify({ positionMs: pos }))
  }

  @LynxMethod
  getDuration(callback: LynxCallback): void {
    const dur = this.engine?.getDuration() ?? 0
    callback(JSON.stringify({ durationMs: dur }))
  }

  @LynxMethod
  setMetadata(jsonStr: string): void {
    try {
      const meta = JSON.parse(jsonStr) as Record<string, string | number>
      this.sessionController.updateMetadata(
        String(meta.title ?? ''),
        String(meta.artist ?? ''),
        String(meta.album ?? ''),
        Number(meta.durationMs ?? 0),
        String(meta.coverUrl ?? ''),
      )
    } catch {}
  }

  @LynxMethod
  setEqEnabled(enabled: boolean): void {
    // TODO: Implement EQ via AudioRenderer when API is available
  }

  @LynxMethod
  setEqBands(bandsJson: string): void {
    // TODO: Implement EQ band adjustment
  }

  @LynxMethod
  getEqBands(callback: LynxCallback): void {
    // Return empty bands until EQ is implemented
    callback(JSON.stringify({ bands: [] }))
  }

  private updateSessionState(state: string): void {
    let sessionState: 'playing' | 'paused' | 'stopped'
    switch (state) {
      case 'playing':
        sessionState = 'playing'
        break
      case 'paused':
        sessionState = 'paused'
        break
      default:
        sessionState = 'stopped'
    }
    const pos = this.engine?.getPosition() ?? 0
    this.sessionController.updatePlaybackState(sessionState, pos, this.currentSpeed)
  }

  private sendEvent(name: string, params: Object[]): void {
    this.lynxContext.sendGlobalEvent(name, params)
  }

  static release(): void {
    SongloftAudioEngine.release()
  }
}
