#import <AppKit/AppKit.h>
#import <MediaPlayer/MediaPlayer.h>
#include <atomic>
#include <mutex>
#include <node_api.h>
#include <string>
#include <third_party/weak-node-api/headers/napi.h>
#include <vector>

namespace {
std::mutex intent_mutex;
std::vector<std::pair<std::string, double>> intents;
std::atomic<bool> playing{false};
NSMutableArray *registrations;
void Main(dispatch_block_t block) {
  if ([NSThread isMainThread])
    block();
  else
    dispatch_sync(dispatch_get_main_queue(), block);
}
void Push(std::string command, double position = 0) {
  std::lock_guard<std::mutex> lock(intent_mutex);
  if (intents.size() < 128)
    intents.emplace_back(std::move(command), position);
}
void Clear() {
  for (NSDictionary *registration in registrations)
    [registration[@"command"] removeTarget:registration[@"target"]];
  registrations = nil;
  [MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo = nil;
  [MPNowPlayingInfoCenter defaultCenter].playbackState =
      MPNowPlayingPlaybackStateStopped;
}
Napi::Value System(const Napi::CallbackInfo &info) {
  auto env = info.Env();
  auto result = Napi::Object::New(env);
  __block bool dark, motion, transparency, contrast;
  __block NSString *locale;
  Main(^{
    dark = [[[NSUserDefaults standardUserDefaults]
        stringForKey:@"AppleInterfaceStyle"] isEqualToString:@"Dark"];
    locale = [[NSLocale currentLocale].localeIdentifier
        stringByReplacingOccurrencesOfString:@"_"
                                  withString:@"-"];
    auto *workspace = [NSWorkspace sharedWorkspace];
    motion = workspace.accessibilityDisplayShouldReduceMotion;
    transparency = workspace.accessibilityDisplayShouldReduceTransparency;
    contrast = workspace.accessibilityDisplayShouldIncreaseContrast;
  });
  result.Set("systemTheme", Napi::String::New(env, dark ? "dark" : "light"));
  result.Set("systemLocale", Napi::String::New(env, locale.UTF8String ?: "en"));
  result.Set("systemReduceMotion", Napi::Boolean::New(env, motion));
  result.Set("systemReduceTransparency", Napi::Boolean::New(env, transparency));
  result.Set("systemIncreaseContrast", Napi::Boolean::New(env, contrast));
  return result;
}
std::string Text(Napi::Object object, const char *key) {
  auto value = object.Get(key);
  return value.IsString() ? value.As<Napi::String>().Utf8Value() : "";
}
double Number(Napi::Object object, const char *key) {
  auto value = object.Get(key);
  return value.IsNumber() ? value.As<Napi::Number>().DoubleValue() : 0;
}
Napi::Value Media(const Napi::CallbackInfo &info) {
  try {
    auto env = info.Env();
    auto method = info[0].As<Napi::String>().Utf8Value();
    if (method == "initialize") {
      Main(^{
        Clear();
        registrations = [NSMutableArray array];
        MPRemoteCommandCenter *center =
            [MPRemoteCommandCenter sharedCommandCenter];
        for (NSDictionary *item in @[
               @{@"command" : center.playCommand, @"intent" : @"play"},
               @{@"command" : center.pauseCommand, @"intent" : @"pause"},
               @{@"command" : center.stopCommand, @"intent" : @"stop"},
               @{@"command" : center.nextTrackCommand, @"intent" : @"next"}, @{
                 @"command" : center.previousTrackCommand,
                 @"intent" : @"previous"
               }
             ]) {
          MPRemoteCommand *command = item[@"command"];
          command.enabled = YES;
          NSString *intent = item[@"intent"];
          id target =
              [command addTargetWithHandler:^MPRemoteCommandHandlerStatus(
                           MPRemoteCommandEvent *) {
                Push(intent.UTF8String);
                return MPRemoteCommandHandlerStatusSuccess;
              }];
          [registrations addObject:@{@"command" : command, @"target" : target}];
        }
        center.togglePlayPauseCommand.enabled = YES;
        id toggle = [center.togglePlayPauseCommand
            addTargetWithHandler:^MPRemoteCommandHandlerStatus(
                MPRemoteCommandEvent *) {
              const bool next = !playing.load();
              playing.store(next);
              Push(next ? "play" : "pause");
              return MPRemoteCommandHandlerStatusSuccess;
            }];
        [registrations addObject:@{
          @"command" : center.togglePlayPauseCommand,
          @"target" : toggle
        }];
        center.changePlaybackPositionCommand.enabled = YES;
        id seek = [center.changePlaybackPositionCommand
            addTargetWithHandler:^MPRemoteCommandHandlerStatus(
                MPRemoteCommandEvent *event) {
              Push(
                  "seek",
                  ((MPChangePlaybackPositionCommandEvent *)event).positionTime *
                      1000);
              return MPRemoteCommandHandlerStatusSuccess;
            }];
        [registrations addObject:@{
          @"command" : center.changePlaybackPositionCommand,
          @"target" : seek
        }];
      });
    } else if (method == "drain") {
      std::lock_guard<std::mutex> lock(intent_mutex);
      auto result = Napi::Array::New(env, intents.size());
      for (uint32_t i = 0; i < intents.size(); ++i) {
        auto event = Napi::Object::New(env);
        event.Set("command", Napi::String::New(env, intents[i].first));
        event.Set("positionMs", Napi::Number::New(env, intents[i].second));
        result.Set(i, event);
      }
      intents.clear();
      return result;
    } else if (method == "update") {
      auto data = info[1].As<Napi::Object>();
      auto title = Text(data, "title"), artist = Text(data, "artist"),
           album = Text(data, "album"), lyric = Text(data, "lyric");
      auto state = Text(data, "state");
      const bool active = state == "playing";
      auto duration = Number(data, "durationMs") / 1000,
           position = Number(data, "positionMs") / 1000;
      auto speed = Number(data, "speed");
      if (speed <= 0)
        speed = 1;
      playing.store(active);
      auto inTitle = data.Get("lyricInTitle");
      const bool lyricTitle =
          inTitle.IsBoolean() && inTitle.As<Napi::Boolean>().Value();
      Main(^{
        NSMutableDictionary *values =
            [[MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo mutableCopy]
                ?: [NSMutableDictionary dictionary];
        values[MPMediaItemPropertyTitle] = [NSString
            stringWithUTF8String:(lyricTitle && !lyric.empty() ? lyric : title)
                                     .c_str()];
        values[MPMediaItemPropertyArtist] = [NSString
            stringWithUTF8String:(lyricTitle && !lyric.empty() ? title : artist)
                                     .c_str()];
        values[MPMediaItemPropertyAlbumTitle] =
            [NSString stringWithUTF8String:album.c_str()];
        values[MPMediaItemPropertyPlaybackDuration] = @(duration);
        values[MPNowPlayingInfoPropertyElapsedPlaybackTime] = @(position);
        values[MPNowPlayingInfoPropertyPlaybackRate] = @(active ? speed : 0.0);
        [MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo = values;
        [MPNowPlayingInfoCenter defaultCenter].playbackState =
            active ? MPNowPlayingPlaybackStatePlaying
                   : MPNowPlayingPlaybackStatePaused;
      });
    } else if (method == "clear") {
      playing.store(false);
      Main(^{
        [MPNowPlayingInfoCenter defaultCenter].nowPlayingInfo = nil;
        [MPNowPlayingInfoCenter defaultCenter].playbackState =
            MPNowPlayingPlaybackStateStopped;
      });
    } else if (method == "close") {
      Main(^{
        Clear();
      });
    } else
      throw std::runtime_error("Unknown media method");
    return env.Null();
  } catch (const std::exception &error) {
    Napi::Error::New(info.Env(), error.what()).ThrowAsJavaScriptException();
    return info.Env().Undefined();
  }
}
} // namespace
void RegisterSystem(napi_env env, napi_value exports) {
  Napi::Object(env, exports)
      .Set("systemAppearance", Napi::Function::New(env, System));
  Napi::Object(env, exports).Set("media", Napi::Function::New(env, Media));
}
