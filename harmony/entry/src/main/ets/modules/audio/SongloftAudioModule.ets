import { LynxModule, LynxContext } from '@lynx/lynx'
import { common } from '@kit.AbilityKit'
import { SongloftAudioEngine } from './SongloftAudioEngine'
import { AVSessionController } from './AVSessionController'
import { BackgroundTaskManager } from './BackgroundTaskManager'
import { ClientFileLog } from '../platform/ClientFileLog'

interface AudioStateEvent {
  state: string
  sourceId: string
}

interface AudioProgressEvent {
  sourceId: string
  positionMs: number
  bufferedMs: number
  durationMs: number
}

interface AudioErrorEvent {
  sourceId: string
  code: number
  message: string
}

interface AudioRemoteCommandEvent {
  command: string
}

interface AudioSourceReadyEvent {
  sourceId: string
  positionMs: number
}

export class SongloftAudioModule extends LynxModule {
  private abilityContext: common.UIAbilityContext
  private engine: SongloftAudioEngine | null = null
  private sessionController: AVSessionController
  private backgroundTask: BackgroundTaskManager
  private currentSpeed: number = 1.0
  private initialization: Promise<void>

  constructor(context: LynxContext, param?: Object) {
    super(context, param)
    this.abilityContext = param as common.UIAbilityContext
    // Same shared log file the platform module writes; idempotent.
    ClientFileLog.init(this.abilityContext)
    this.sessionController = new AVSessionController(this.abilityContext)
    this.backgroundTask = new BackgroundTaskManager(this.abilityContext)
    this.initialization = this.initEngine()
  }

  private async initEngine(): Promise<void> {
    this.engine = await SongloftAudioEngine.getInstance()
    await this.sessionController.create()

    this.engine.onStateChange = (state: string) => {
      const event: AudioStateEvent = { state: state, sourceId: this.engine?.getSourceId() ?? '' }
      this.context.sendGlobalEvent('SongloftAudio.stateChanged', [event])
      ClientFileLog.write('I', 'audio', `state=${state}`)
      this.updateSessionState(state)
    }

    this.engine.onProgress = (positionMs: number, durationMs: number) => {
      // No log here: the tick fires every 500 ms and would bury the file.
      const event: AudioProgressEvent = { positionMs: positionMs, bufferedMs: positionMs, durationMs: durationMs, sourceId: this.engine?.getSourceId() ?? '' }
      this.context.sendGlobalEvent('SongloftAudio.progress', [event])
    }

    this.engine.onError = (code: number, message: string) => {
      const event: AudioErrorEvent = { code: code, message: message, sourceId: this.engine?.getSourceId() ?? '' }
      this.context.sendGlobalEvent('SongloftAudio.error', [event])
      ClientFileLog.write('E', 'audio', `error code=${code} ${ClientFileLog.truncText(message)}`)
    }

    // completed already arrives through onStateChange; do not advance twice.
    this.engine.onSourceReady = (sourceId: string, positionMs: number) => {
      const event: AudioSourceReadyEvent = { sourceId: sourceId, positionMs: positionMs }
      this.context.sendGlobalEvent('SongloftAudio.sourceReady', [event])
    }

    this.sessionController.onCommand = (command: string) => {
      const event: AudioRemoteCommandEvent = { command: command }
      this.context.sendGlobalEvent('SongloftAudio.remoteCommand', [event])
    }
  }

  public load(url: string, opts?: Record<string, Object>): void {
    const sourceId = opts?.sourceId as string ?? ''
    const startMs = opts?.initialPositionMs as number ?? 0
    const autoplay = opts?.autoplay as boolean ?? false
    ClientFileLog.write('I', 'audio', `load ${ClientFileLog.truncUrl(url)} startMs=${startMs}`)
    this.backgroundTask.startBackgroundTask()
    this.initialization.then(() => {
      if (sourceId.length > 0) {
        return this.engine?.load(url, startMs, autoplay, sourceId)
      }
      return this.engine?.play(url, startMs)
    }).catch((err: Error) => {
      const event: AudioErrorEvent = { code: -1, message: err.message, sourceId: sourceId }
      this.context.sendGlobalEvent('SongloftAudio.error', [event])
    })
  }

  public getSourceLoadVersion(callback: (version: number) => void): void {
    callback(1)
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
    this.engine?.setVolume(volume)
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
