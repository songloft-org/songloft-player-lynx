import { LynxModule, LynxContext } from '@lynx/lynx'
import { common } from '@kit.AbilityKit'
import { SongloftAudioEngine } from './SongloftAudioEngine'
import { AVSessionController } from './AVSessionController'
import { BackgroundTaskManager } from './BackgroundTaskManager'
import { ClientFileLog } from '../platform/ClientFileLog'

interface AudioStateEvent {
  state: string
}

interface AudioProgressEvent {
  positionMs: number
  bufferedMs: number
  durationMs: number
}

interface AudioErrorEvent {
  code: number
  message: string
}

interface AudioRemoteCommandEvent {
  command: string
}

export class SongloftAudioModule extends LynxModule {
  private abilityContext: common.UIAbilityContext
  private engine: SongloftAudioEngine | null = null
  private sessionController: AVSessionController
  private backgroundTask: BackgroundTaskManager
  private currentSpeed: number = 1.0

  constructor(context: LynxContext, param?: Object) {
    super(context, param)
    this.abilityContext = param as common.UIAbilityContext
    // Same shared log file the platform module writes; idempotent.
    ClientFileLog.init(this.abilityContext)
    this.sessionController = new AVSessionController(this.abilityContext)
    this.backgroundTask = new BackgroundTaskManager(this.abilityContext)
    this.initEngine()
  }

  private async initEngine(): Promise<void> {
    this.engine = await SongloftAudioEngine.getInstance()
    await this.sessionController.create()

    this.engine.onStateChange = (state: string) => {
      const event: AudioStateEvent = { state: state }
      this.context.sendGlobalEvent('SongloftAudio.stateChanged', [event])
      ClientFileLog.write('I', 'audio', `state=${state}`)
      this.updateSessionState(state)
    }

    this.engine.onProgress = (positionMs: number, durationMs: number) => {
      // No log here: the tick fires every 500 ms and would bury the file.
      const event: AudioProgressEvent = { positionMs: positionMs, bufferedMs: positionMs, durationMs: durationMs }
      this.context.sendGlobalEvent('SongloftAudio.progress', [event])
    }

    this.engine.onError = (code: number, message: string) => {
      const event: AudioErrorEvent = { code: code, message: message }
      this.context.sendGlobalEvent('SongloftAudio.error', [event])
      ClientFileLog.write('E', 'audio', `error code=${code} ${ClientFileLog.truncText(message)}`)
    }

    this.engine.onTrackEnd = () => {
      const event: AudioStateEvent = { state: 'completed' }
      this.context.sendGlobalEvent('SongloftAudio.stateChanged', [event])
    }

    this.sessionController.onCommand = (command: string) => {
      const event: AudioRemoteCommandEvent = { command: command }
      this.context.sendGlobalEvent('SongloftAudio.remoteCommand', [event])
    }
  }

  public load(url: string, opts?: Record<string, Object>): void {
    const startMs = opts?.startMs as number ?? 0
    ClientFileLog.write('I', 'audio', `load ${ClientFileLog.truncUrl(url)} startMs=${startMs}`)
    this.backgroundTask.startBackgroundTask()
    this.engine?.play(url, startMs)
  }

  public play(): void {
    this.engine?.resume()
  }

  public pause(): void {
    this.engine?.pause()
  }

  public stop(): void {
    this.engine?.stop()
    this.backgroundTask.stopBackgroundTask()
  }

  public seek(positionMs: number): void {
    this.engine?.seek(positionMs)
  }

  public setVolume(volume: number): void {
    this.engine?.setVolume(volume / 100)
  }

  public setSpeed(rate: number): void {
    this.currentSpeed = rate
    this.engine?.setSpeed(rate)
  }

  public setQueue(items: Object[], startIndex: number): void {}

  public next(): void {}

  public previous(): void {}

  public setRepeatMode(mode: string): void {}

  public setShuffle(on: boolean): void {}

  public setFavorite(isFavorite: boolean): void {}

  public setEqualizerEnabled(on: boolean): void {}

  public setEqualizerBand(index: number, gainDb: number): void {}

  public dispose(): void {
    this.engine?.stop()
    this.backgroundTask.stopBackgroundTask()
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
