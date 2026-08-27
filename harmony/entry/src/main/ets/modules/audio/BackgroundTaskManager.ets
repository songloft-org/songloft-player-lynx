import { backgroundTaskManager } from '@kit.BackgroundTasksKit'
import { wantAgent, WantAgent } from '@kit.AbilityKit'
import { common } from '@kit.AbilityKit'

/**
 * Background task management for audio playback.
 *
 * HarmonyOS requires BOTH AVSession AND a long-running task (audioPlayback)
 * for background audio. Missing either causes:
 * - No long-running task: process gets suspended after ~10s in background
 * - No AVSession: system force-pauses audio playback
 */
export class BackgroundTaskManager {
  private context: common.UIAbilityContext
  private running: boolean = false

  constructor(context: common.UIAbilityContext) {
    this.context = context
  }

  async startBackgroundTask(): Promise<void> {
    if (this.running) return

    const wantAgentInfo: wantAgent.WantAgentInfo = {
      wants: [
        {
          bundleName: this.context.abilityInfo.bundleName,
          abilityName: this.context.abilityInfo.name,
        }
      ],
      actionType: wantAgent.OperationType.START_ABILITY,
      requestCode: 0,
      actionFlags: [wantAgent.WantAgentFlags.UPDATE_PRESENT_FLAG],
    }

    const agent: WantAgent = await wantAgent.getWantAgent(wantAgentInfo)

    await backgroundTaskManager.startBackgroundRunning(this.context, backgroundTaskManager.BackgroundMode.AUDIO_PLAYBACK, agent)
    this.running = true
  }

  async stopBackgroundTask(): Promise<void> {
    if (!this.running) return
    await backgroundTaskManager.stopBackgroundRunning(this.context)
    this.running = false
  }

  isRunning(): boolean {
    return this.running
  }
}
