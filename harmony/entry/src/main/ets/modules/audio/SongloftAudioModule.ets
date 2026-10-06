import { LynxModule, LynxContext } from '@lynx/lynx'
import { common } from '@kit.AbilityKit'
import { SongloftAudioEngine } from './SongloftAudioEngine'
import { AVSessionController, SessionMetadata } from './AVSessionController'
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

interface AudioQueueEntry {
  id: string | number
  url: string
  title?: string
  artist?: string
  durationMs?: number
  artworkUrl?: string
}

interface AudioVolumeEvent { volume: number }

export class SongloftAudioModule extends LynxModule {
  private abilityContext: common.UIAbilityContext
  private engine: SongloftAudioEngine | null = null
  private sessionController: AVSessionController
  private backgroundTask: BackgroundTaskManager
  private currentSpeed: number = 1.0
  private initialization: Promise<void>
  private metadataByUrl: Map<string, SessionMetadata> = new Map()
  private currentUrl: string = ''
  private expectedSourceId: string = ''
  private currentState: string = 'idle'
  private lastSessionProgress: number = 0
  private disposed: boolean = false

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
    if (this.disposed) return
    // A media-card failure must not reject initialization or prevent normal audio.
    await this.sessionController.create().catch((): void => {})
    if (this.disposed) {
      await this.sessionController.destroy().catch((): void => {})
      return
    }

    this.engine.onStateChange = (state: string) => {
      if (this.disposed) return
      this.currentState = state
      const event: AudioStateEvent = { state: state, sourceId: this.engine?.getSourceId() ?? '' }
      this.context.sendGlobalEvent('SongloftAudio.stateChanged', [event])
      ClientFileLog.write('I', 'audio', `state=${state}`)
      this.updateSessionState(state)
    }

    this.engine.onProgress = (positionMs: number, durationMs: number) => {
      if (this.disposed) return
      // No log here: the tick fires every 500 ms and would bury the file.
      const event: AudioProgressEvent = { positionMs: positionMs, bufferedMs: positionMs, durationMs: durationMs, sourceId: this.engine?.getSourceId() ?? '' }
      this.context.sendGlobalEvent('SongloftAudio.progress', [event])
      if (event.sourceId === this.expectedSourceId) {
        this.sessionController.updateDuration(durationMs)
        if (Date.now() - this.lastSessionProgress >= 2000) {
          this.lastSessionProgress = Date.now()
          this.updateSessionState(this.currentState)
        }
      }
    }

    this.engine.onError = (code: number, message: string) => {
      if (this.disposed) return
      const event: AudioErrorEvent = { code: code, message: message, sourceId: this.engine?.getSourceId() ?? '' }
      this.context.sendGlobalEvent('SongloftAudio.error', [event])
      ClientFileLog.write('E', 'audio', `error code=${code} ${ClientFileLog.truncText(message)}`)
    }

    // completed already arrives through onStateChange; do not advance twice.
    this.engine.onSourceReady = (sourceId: string, positionMs: number) => {
      if (this.disposed) return
      const event: AudioSourceReadyEvent = { sourceId: sourceId, positionMs: positionMs }
      this.context.sendGlobalEvent('SongloftAudio.sourceReady', [event])
    }

    this.sessionController.onCommand = (command: string, value?: number) => {
      if (this.disposed) return
      if (command === 'play') this.play()
      else if (command === 'pause') this.pause()
      else if (command === 'seek' && value !== undefined) this.seek(value)
      else if (command === 'setSpeed' && value !== undefined) this.setSpeed(value)
      else if (command === 'next' || command === 'previous' || command === 'stop' || command === 'toggleFavorite') {
        this.emitCommand(command)
      }
    }
  }

  public load(url: string, opts?: Record<string, Object>): void {
    const sourceId = opts?.sourceId as string ?? ''
    const startMs = opts?.initialPositionMs as number ?? 0
    const autoplay = opts?.autoplay as boolean ?? false
    this.currentUrl = url
    this.expectedSourceId = sourceId
    this.sessionController.updateLyric(null, true)
    this.refreshMetadata()
    ClientFileLog.write('I', 'audio', `load ${ClientFileLog.truncUrl(url)} startMs=${startMs}`)
    this.backgroundTask.startBackgroundTask()
    this.initialization.then(() => {
      if (this.disposed || sourceId !== this.expectedSourceId) return
      if (sourceId.length > 0) {
        return this.engine?.load(url, startMs, autoplay, sourceId)
      }
      return this.engine?.play(url, startMs)
    }).catch((err: Error) => {
      if (this.disposed || sourceId !== this.expectedSourceId) return
      const event: AudioErrorEvent = { code: -1, message: err.message, sourceId: sourceId }
      this.context.sendGlobalEvent('SongloftAudio.error', [event])
    })
  }

  public getSourceLoadVersion(callback: (version: number) => void): void {
    callback(1)
  }

  public play(): void {
    this.runEngine(this.engine?.resume())
  }

  public pause(): void {
    this.runEngine(this.engine?.pause())
  }

  public stop(): void {
    this.runEngine(this.engine?.stop())
    this.sessionController.updateLyric(null, true)
    this.backgroundTask.stopBackgroundTask()
  }

  public seek(positionMs: number): void {
    this.runEngine(this.engine?.seek(positionMs))
    this.sessionController.updatePlaybackState(this.currentState, positionMs, this.currentSpeed)
  }

  public setVolume(volume: number): void {
    this.engine?.setVolume(volume)
  }

  public setSpeed(rate: number): void {
    this.currentSpeed = rate
    this.engine?.setSpeed(rate)
    this.updateSessionState(this.currentState)
  }

  public getVolume(): void {
    this.initialization.then((): void => {
      if (this.disposed) return
      const event: AudioVolumeEvent = { volume: Math.round((this.engine?.getVolume() ?? 1) * 100) }
      this.context.sendGlobalEvent('SongloftAudio.volumeChanged', [event])
    }).catch((): void => {})
  }

  public setQueue(items: Object[], startIndex: number): void {
    this.metadataByUrl.clear()
    for (const entry of items) {
      const item = entry as AudioQueueEntry
      if (typeof item.url !== 'string' || item.url.length === 0) continue
      const metadata: SessionMetadata = { assetId: String(item.id), title: item.title ?? '', artist: item.artist ?? '',
        album: '', durationMs: item.durationMs ?? 0, coverUrl: item.artworkUrl ?? '' }
      this.metadataByUrl.set(item.url, metadata)
    }
    // The JS queue owns playback; setQueue only supplies metadata for the current source.
    this.refreshMetadata()
  }

  public next(): void { this.emitCommand('next') }

  public previous(): void { this.emitCommand('previous') }

  public setRepeatMode(mode: string): void { this.sessionController.setRepeatMode(mode) }

  public setShuffle(on: boolean): void { this.sessionController.setShuffle(on) }

  public setFavorite(isFavorite: boolean): void { this.sessionController.setFavorite(isFavorite) }

  public updateNotificationLyric(lyric: string | null, inTitle: boolean): void {
    this.sessionController.updateLyric(lyric, inTitle)
  }

  public updateNotificationLyricWithLayout(lyric: string | null, inTitle: boolean): void {
    this.updateNotificationLyric(lyric, inTitle)
  }

  // API 13 host has no implemented DSP. UI and facade gate these unsupported operations.
  public setEqualizerEnabled(on: boolean): void {}

  public setEqualizerBand(index: number, gainDb: number): void {}

  public dispose(): void {
    this.disposed = true
    this.runEngine(this.engine?.stop())
    this.backgroundTask.stopBackgroundTask()
    this.sessionController.destroy().catch((): void => {})
  }

  private runEngine(task: Promise<void> | undefined): void {
    const sourceId = this.engine?.getSourceId() ?? this.expectedSourceId
    task?.catch((error: Error): void => {
      if (this.disposed || sourceId !== this.expectedSourceId) return
      const event: AudioErrorEvent = { code: -1, message: error.message, sourceId: sourceId }
      this.context.sendGlobalEvent('SongloftAudio.error', [event])
    })
  }

  private emitCommand(command: string): void {
    const event: AudioRemoteCommandEvent = { command: command }
    this.context.sendGlobalEvent('SongloftAudio.remoteCommand', [event])
  }

  private refreshMetadata(): void {
    const cached = this.metadataByUrl.get(this.currentUrl)
    const metadata: SessionMetadata = cached ?? { assetId: 'songloft', title: '', artist: '', album: '', durationMs: 0, coverUrl: '' }
    this.sessionController.updateMetadata(metadata)
  }

  private updateSessionState(state: string): void {
    const pos = this.engine?.getPosition() ?? 0
    this.sessionController.updatePlaybackState(state, pos, this.currentSpeed)
  }

  static release(): void {
    SongloftAudioEngine.release()
  }
}
