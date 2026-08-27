import { LynxModule, LynxMethod, LynxCallback, LynxContext } from '@lynx/lynx'
import { common } from '@kit.AbilityKit'
import { SongloftAudioEngine } from './SongloftAudioEngine'
import { AVSessionController } from './AVSessionController'
import { BackgroundTaskManager } from './BackgroundTaskManager'

interface AudioStateParam {
  state: string
}

interface AudioProgressParam {
  positionMs: number
  durationMs: number
}

interface AudioErrorParam {
  code: number
  message: string
}

interface AudioRemoteCommandParam {
  command: string
  args: string
}

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
      const param: AudioStateParam = { state: state }
      this.lynxContext.sendGlobalEvent('audio:state', [param])
      this.updateSessionState(state)
    }

    this.engine.onProgress = (positionMs: number, durationMs: number) => {
      const param: AudioProgressParam = { positionMs: positionMs, durationMs: durationMs }
      this.lynxContext.sendGlobalEvent('audio:progress', [param])
    }

    this.engine.onError = (code: number, message: string) => {
      const param: AudioErrorParam = { code: code, message: message }
      this.lynxContext.sendGlobalEvent('audio:error', [param])
    }

    this.engine.onTrackEnd = () => {
      const param: Record<string, string> = {}
      this.lynxContext.sendGlobalEvent('audio:trackEnd', [param])
    }

    this.sessionController.onCommand = (command: string, args?: Record<string, string | number>) => {
      const param: AudioRemoteCommandParam = {
        command: command,
        args: args ? JSON.stringify(args) : ''
      }
      this.lynxContext.sendGlobalEvent('audio:remoteCommand', [param])
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
      const meta: Record<string, string | number> = JSON.parse(jsonStr)
      this.sessionController.updateMetadata(
        String(meta.title ?? ''),
        String(meta.artist ?? ''),
        String(meta.album ?? ''),
        Number(meta.durationMs ?? 0),
        String(meta.coverUrl ?? ''),
      )
    } catch (e) {
      // ignore malformed metadata
    }
  }

  @LynxMethod
  setEqEnabled(enabled: boolean): void {
  }

  @LynxMethod
  setEqBands(bandsJson: string): void {
  }

  @LynxMethod
  getEqBands(callback: LynxCallback): void {
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

  static release(): void {
    SongloftAudioEngine.release()
  }
}
