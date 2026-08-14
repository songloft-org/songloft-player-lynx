import Foundation
import ActivityKit

/// Lynx native module `NativeModules.SongloftLiveActivity` — manages a Live
/// Activity showing the current song on the lock screen.
///
/// Requires iOS 16.1+ and a Widget Extension target (SongloftLynxWidgets).
@available(iOS 16.2, *)
final class LiveActivityModule: NSObject, LynxModule {
    @objc required init(param: Any) {}
    override init() { super.init() }

    @objc static var name: String { "SongloftLiveActivity" }

    @objc static var methodLookup: [String: String] {
        [
            "start": NSStringFromSelector(#selector(LiveActivityModule.start(_:callback:))),
            "update": NSStringFromSelector(#selector(LiveActivityModule.update(_:callback:))),
            "end": NSStringFromSelector(#selector(LiveActivityModule.end(_:callback:))),
        ]
    }

    struct NowPlayingAttributes: ActivityAttributes {
        public struct ContentState: Codable, Hashable {
            var title: String
            var artist: String
            var isPlaying: Bool
        }
        var startedAt: Date
    }

    private var currentActivity: Activity<NowPlayingAttributes>?

    // MARK: - JS Methods

    /// start(title, artist) → callback(activityId: String)
    @objc func start(_ args: String, callback: @escaping (String) -> Void) {
        guard let data = args.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let title = json["title"] as? String,
              let artist = json["artist"] as? String
        else {
            callback("")
            return
        }
        let attributes = NowPlayingAttributes(startedAt: Date())
        let state = NowPlayingAttributes.ContentState(
            title: title,
            artist: artist,
            isPlaying: true
        )
        do {
            let activity = try Activity.request(
                attributes: attributes,
                content: .init(state: state, staleDate: nil)
            )
            currentActivity = activity
            callback(activity.id)
        } catch {
            callback("")
        }
    }

    /// update(id, title, artist, isPlaying) → callback("{}")
    @objc func update(_ args: String, callback: @escaping (String) -> Void) {
        guard let data = args.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = json["id"] as? String,
              let activity = currentActivity, activity.id == id
        else {
            callback("{}")
            return
        }
        let title = json["title"] as? String ?? ""
        let artist = json["artist"] as? String ?? ""
        let isPlaying = json["isPlaying"] as? Bool ?? false
        let state = NowPlayingAttributes.ContentState(
            title: title,
            artist: artist,
            isPlaying: isPlaying
        )
        Task {
            await activity.update(.init(state: state, staleDate: nil))
            callback("{}")
        }
    }

    /// end(id) → callback("{}")
    @objc func end(_ args: String, callback: @escaping (String) -> Void) {
        guard let data = args.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let id = json["id"] as? String,
              let activity = currentActivity, activity.id == id
        else {
            callback("{}")
            return
        }
        Task {
            await activity.end(nil, dismissalPolicy: .immediate)
            currentActivity = nil
            callback("{}")
        }
    }
}