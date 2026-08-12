import Foundation
import ActivityKit

/// TS-side interface: `SongloftLiveActivity.start/update/end`
/// This module manages a Live Activity showing the current song on the lock screen.
/// Requires iOS 16.1+ and a Widget Extension target (SongloftLynxWidgets).
///
/// NOTE: This is a stub. The actual Widget Extension target and ActivityAttributes
/// must be added to the Xcode project separately. This module handles the host-side
/// start/update/end lifecycle.
@available(iOS 16.1, *)
enum LiveActivityModule {
    static let moduleName = "SongloftLiveActivity"

    struct NowPlayingAttributes: ActivityAttributes {
        public struct ContentState: Codable, Hashable {
            var title: String
            var artist: String
            var isPlaying: Bool
        }
        var startedAt: Date
    }

    private static var currentActivity: Activity<NowPlayingAttributes>?

    static func start(title: String, artist: String) -> String {
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
            return activity.id
        } catch {
            return ""
        }
    }

    static func update(id: String, title: String, artist: String, isPlaying: Bool) {
        guard let activity = currentActivity, activity.id == id else { return }
        let state = NowPlayingAttributes.ContentState(
            title: title,
            artist: artist,
            isPlaying: isPlaying
        )
        Task {
            await activity.update(.init(state: state, staleDate: nil))
        }
    }

    static func end(id: String) {
        guard let activity = currentActivity, activity.id == id else { return }
        Task {
            await activity.end(nil, dismissalPolicy: .immediate)
            currentActivity = nil
        }
    }
}
