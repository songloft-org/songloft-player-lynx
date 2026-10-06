import { media } from '@kit.MediaKit'
import { fileIo } from '@kit.CoreFileKit'

/** Hold a local descriptor until AVPlayer reset/release finishes; network URLs remain unchanged. */
export class LocalAudioSource {
  private file?: fileIo.File = undefined

  /** Caller must await AVPlayer.reset() before assigning a new source. */
  assign(player: media.AVPlayer, address: string): void {
    this.close()
    if (!address.startsWith('file://')) {
      player.url = address
      return
    }
    const file = fileIo.openSync(address, fileIo.OpenMode.READ_ONLY)
    try {
      player.url = 'fd://' + file.fd
      this.file = file
    } catch (error) {
      fileIo.closeSync(file.fd)
      throw error as Error
    }
  }

  close(): void {
    const file = this.file
    this.file = undefined
    if (file) fileIo.closeSync(file.fd)
  }
}
