import { LynxContext, LynxViewClient } from '@lynx/lynx'

interface ResumePayload { state: string }

/** Root-view readiness is separate from ability foreground state. */
export class AppLifecycle {
  private static context: LynxContext | null = null
  private static foreground: boolean = false
  private static ready: boolean = false
  private static pending: boolean = false

  static attach(context: LynxContext): void {
    AppLifecycle.context = context
    AppLifecycle.ready = false
    AppLifecycle.pending = AppLifecycle.foreground
  }

  static markReady(context: LynxContext): void {
    if (AppLifecycle.context !== context) return
    AppLifecycle.ready = true
    AppLifecycle.flush()
  }

  static enterForeground(): void {
    if (AppLifecycle.foreground) return
    AppLifecycle.foreground = true
    AppLifecycle.pending = true
    AppLifecycle.flush()
  }

  static enterBackground(): void {
    AppLifecycle.foreground = false
    AppLifecycle.pending = false
  }

  static detach(context: LynxContext): void {
    if (AppLifecycle.context !== context) return
    AppLifecycle.context = null
    AppLifecycle.ready = false
    AppLifecycle.pending = false
  }

  static reset(): void {
    AppLifecycle.context = null
    AppLifecycle.ready = false
    AppLifecycle.pending = false
    AppLifecycle.foreground = false
  }

  private static flush(): void {
    const context = AppLifecycle.context
    if (!context || !AppLifecycle.foreground || !AppLifecycle.ready || !AppLifecycle.pending) return
    AppLifecycle.pending = false
    const payload: ResumePayload = { state: 'resumed' }
    context.sendGlobalEvent('SongloftLifecycle.resumed', [payload])
  }
}

export class AppLifecycleClient extends LynxViewClient {
  private context: LynxContext | null = null

  attach(context: LynxContext): void {
    this.context = context
    AppLifecycle.attach(context)
  }

  public onFirstScreen(): void {
    if (this.context) AppLifecycle.markReady(this.context)
  }

  detach(): void {
    if (this.context) AppLifecycle.detach(this.context)
    this.context = null
  }

  public onDestroy(): void { this.detach() }
}
