import AVFoundation
import Foundation
import UniformTypeIdentifiers

/**
 * Plays media from a server whose TLS certificate does not validate, by loading the
 * bytes ourselves through `InsecureTls.session` instead of letting AVFoundation do it.
 *
 * **Why this exists at all.** `InsecureTls.attachIfNeeded` used to hang an
 * `AVAssetResourceLoaderDelegate` on the asset in the hope of answering the
 * server-trust challenge for a plain `https://` asset. Apple never guaranteed that
 * callback for ordinary http(s) URLs, and **it does not fire** — measured on iOS 18.3
 * against a self-signed server: login and browsing worked (those go through
 * `SongloftHttpService`), while playback failed immediately with `state=error` /
 * "The certificate for this server is invalid."
 *
 * The only reliable lever is that AVFoundation *must* ask a delegate about a scheme it
 * cannot load itself. So the asset URL's scheme is swapped for [scheme] and every
 * loading request comes here, where an ordinary `URLSession` — the one whose delegate
 * relaxes trust — fetches the bytes.
 *
 * **What that costs us**, and why the previous batch deferred it: AVFoundation is no
 * longer talking HTTP, so this class has to be the HTTP client. That means serving
 * `contentInformationRequest` (MIME → UTI, total length, whether ranges work) and
 * arbitrary byte ranges for `dataRequest`, including the open-ended
 * `requestsAllDataToEndOfResource` form, and streaming the response rather than
 * buffering a whole file.
 *
 * **HLS.** A media playlist fetched through here is parsed by AVFoundation as usual,
 * and *relative* URIs inside it resolve against the playlist URL — which still carries
 * [scheme], so segments and keys come back here too. Songloft's own HLS proxy emits
 * relative URLs for exactly its own reasons, so that path lines up by construction.
 * **Absolute** `https://` URIs inside a playlist do not: AVFoundation would load those
 * natively and hit the same certificate wall. Rewriting playlist bodies to fix that is
 * not done here — see `docs/tracking/bug.md`.
 *
 * Only used while `InsecureTls.enabled`; with the switch off the asset keeps its
 * original URL and AVFoundation loads it natively, exactly as before.
 */
final class InsecureMediaLoader: NSObject {
  static let shared = InsecureMediaLoader()

  /**
   * Scheme AVFoundation cannot handle, so it has to delegate. Deliberately not a
   * registered URL type: nothing outside this class is meant to resolve it.
   */
  static let scheme = "songloft-insecure-https"

  /**
   * Serial queue the resource loader calls us back on, and which guards [tasks].
   *
   * **Must not be the main queue.** `AudioEqualizer.buildAudioMix` reads
   * `asset.tracks(withMediaType:)`, which blocks until the asset has loaded, and the
   * engine calls it from the main thread. With the callbacks scheduled on main, the
   * only thread that could deliver the bytes is the one already blocked waiting for
   * them: measured as a ~10 s stall per attempt, then `AVFoundationErrorDomain -11800`
   * with `curll_respondToHandleRequestCompletionOnQueue: … timed-out on handler` in the
   * device log, and the HTTP request finally leaving *after* AVFoundation had given up.
   */
  let callbackQueue = DispatchQueue(label: "org.songloft.lynx.insecure-media-loader")

  /// In-flight fetch per loading request, so `didCancel` can stop it.
  private var tasks: [ObjectIdentifier: URLSessionDataTask] = [:]

  /**
   * The URL to hand `AVURLAsset`: the custom scheme when the switch is on and the
   * original is `https`, otherwise the original unchanged.
   *
   * `http` URLs are left alone — there is no certificate to distrust, and ATS already
   * permits them (`NSAllowsArbitraryLoads`), so routing them through here would add a
   * hand-written HTTP client to the common local-network case for no benefit.
   */
  static func assetURL(for url: URL) -> URL {
    guard InsecureTls.shared.enabled, url.scheme?.lowercased() == "https" else { return url }
    var parts = URLComponents(url: url, resolvingAgainstBaseURL: false)
    parts?.scheme = scheme
    return parts?.url ?? url
  }

  /// Reverse of [assetURL] — the `https` URL to actually request.
  private static func originURL(for url: URL) -> URL? {
    guard url.scheme?.lowercased() == scheme else { return nil }
    var parts = URLComponents(url: url, resolvingAgainstBaseURL: false)
    parts?.scheme = "https"
    return parts?.url
  }

  /**
   * Request for one loading request's byte range.
   *
   * The open-ended `bytes=start-` form is used when AVFoundation asks for everything
   * to the end of the resource; asking for `start-(start+length-1)` there would need a
   * length we do not know yet. A `contentInformationRequest` with no data request only
   * needs the headers, but HEAD is not asked of the server: a 2-byte ranged GET both
   * reveals the total length (via `Content-Range`) and proves that ranges work, which
   * a HEAD's `Accept-Ranges` only claims.
   */
  private static func request(
    for loadingRequest: AVAssetResourceLoadingRequest,
    origin: URL
  ) -> URLRequest {
    var request = URLRequest(url: origin)
    if let headers = loadingRequest.request.allHTTPHeaderFields {
      for (key, value) in headers where key.lowercased() != "range" {
        request.setValue(value, forHTTPHeaderField: key)
      }
    }
    if let dataRequest = loadingRequest.dataRequest {
      let start = dataRequest.requestedOffset
      if dataRequest.requestsAllDataToEndOfResource {
        request.setValue("bytes=\(start)-", forHTTPHeaderField: "Range")
      } else {
        let end = start + Int64(dataRequest.requestedLength) - 1
        request.setValue("bytes=\(start)-\(end)", forHTTPHeaderField: "Range")
      }
    } else {
      request.setValue("bytes=0-1", forHTTPHeaderField: "Range")
    }
    return request
  }

  /**
   * Fill in `contentInformationRequest` from the response.
   *
   * `Content-Range: bytes a-b/total` is the only header that gives the *resource*
   * length for a 206; `expectedContentLength` on a partial response is just the size
   * of the slice, and using it would make AVFoundation think the track was as long as
   * the first chunk. A `*` total (unknown, e.g. a live stream) leaves the length unset.
   */
  fileprivate static func describe(
    _ response: HTTPURLResponse,
    to info: AVAssetResourceLoadingContentInformationRequest
  ) {
    if let mime = response.mimeType, let type = UTType(mimeType: mime) {
      info.contentType = type.identifier
    }
    info.isByteRangeAccessSupported = response.statusCode == 206
    if let range = response.value(forHTTPHeaderField: "Content-Range"),
       let total = range.split(separator: "/").last,
       let length = Int64(total.trimmingCharacters(in: .whitespaces)) {
      info.contentLength = length
    } else if response.statusCode == 200, response.expectedContentLength > 0 {
      info.contentLength = response.expectedContentLength
    }
  }
}

extension InsecureMediaLoader: AVAssetResourceLoaderDelegate {
  func resourceLoader(
    _ resourceLoader: AVAssetResourceLoader,
    shouldWaitForLoadingOfRequestedResource loadingRequest: AVAssetResourceLoadingRequest
  ) -> Bool {
    guard let url = loadingRequest.request.url,
          let origin = Self.originURL(for: url)
    else {
      return false
    }

    let request = Self.request(for: loadingRequest, origin: origin)
    let key = ObjectIdentifier(loadingRequest)
    // Streamed rather than collected: AVFoundation opens playback with one
    // `requestsAllDataToEndOfResource` request, so the completion-handler form would
    // hold the entire rest of the track in memory before handing over a single byte
    // (measured: a 19 MB / 20-minute file arrived as one 19 MB buffer). Feeding
    // `respond(with:)` per chunk also restores the normal shape of AVFoundation's
    // reads — it can cancel a stream it no longer needs and re-request at the offset
    // it seeked to, instead of only ever being able to consume from the front.
    let task = InsecureTls.shared.session.dataTask(with: request)
    task.delegate = Fetch(loadingRequest: loadingRequest) { [weak self] in
      self?.callbackQueue.async { self?.tasks.removeValue(forKey: key) }
    }
    callbackQueue.async { self.tasks[key] = task }
    task.resume()
    return true
  }

  func resourceLoader(
    _ resourceLoader: AVAssetResourceLoader,
    didCancel loadingRequest: AVAssetResourceLoadingRequest
  ) {
    let key = ObjectIdentifier(loadingRequest)
    callbackQueue.async {
      self.tasks.removeValue(forKey: key)?.cancel()
    }
  }
}

/**
 * Per-request receiver, attached as the task's own delegate so the shared session (and
 * therefore its connection pool, and `InsecureTls`'s ability to drop that pool when the
 * switch flips) stays in use. TLS challenges are deliberately *not* implemented here:
 * unhandled task-delegate methods fall through to the session delegate, which is
 * `InsecureTls` itself.
 */
private final class Fetch: NSObject, URLSessionDataDelegate {
  private let loadingRequest: AVAssetResourceLoadingRequest
  private let onFinish: () -> Void
  /// Retains `self` until the task completes; `URLSessionTask.delegate` is weak.
  private var retained: Fetch?

  init(loadingRequest: AVAssetResourceLoadingRequest, onFinish: @escaping () -> Void) {
    self.loadingRequest = loadingRequest
    self.onFinish = onFinish
    super.init()
    retained = self
  }

  func urlSession(
    _ session: URLSession,
    dataTask: URLSessionDataTask,
    didReceive response: URLResponse,
    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void
  ) {
    guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
      let status = (response as? HTTPURLResponse)?.statusCode ?? -1
      finish(
        with: NSError(
          domain: "org.songloft.lynx.media",
          code: status,
          userInfo: [NSLocalizedDescriptionKey: "media request failed with status \(status)"]
        )
      )
      completionHandler(.cancel)
      return
    }
    if let info = loadingRequest.contentInformationRequest {
      InsecureMediaLoader.describe(http, to: info)
    }
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard !loadingRequest.isCancelled else { return }
    loadingRequest.dataRequest?.respond(with: data)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    // A cancel is AVFoundation losing interest (a seek, or the item going away), not a
    // failure: finishing the request with that error would surface as a playback error.
    if let error, (error as NSError).code != NSURLErrorCancelled {
      finish(with: error)
    } else {
      finish(with: nil)
    }
  }

  private func finish(with error: Error?) {
    defer {
      onFinish()
      retained = nil
    }
    guard !loadingRequest.isCancelled, !loadingRequest.isFinished else { return }
    if let error {
      loadingRequest.finishLoading(with: error)
    } else {
      loadingRequest.finishLoading()
    }
  }
}
