#include "mpv_engine.h"
void SetDesktopBridgeToken(const std::string &token);
#include <node_api.h>
#include <third_party/weak-node-api/headers/napi.h>
#ifdef _WIN32
#include <windows.h>
#else
#include <dlfcn.h>
#endif

namespace {
std::mutex owner_mutex;
std::shared_ptr<Engine> owned_engine;
using FindFormat = const void *(*)(const char *);
FindFormat InputFormats() {
#ifdef _WIN32
  auto library = GetModuleHandleW(L"avformat-62.dll");
  return library ? reinterpret_cast<FindFormat>(
                       GetProcAddress(library, "av_find_input_format"))
                 : nullptr;
#else
  return reinterpret_cast<FindFormat>(
      dlsym(RTLD_DEFAULT, "av_find_input_format"));
#endif
}
std::string Text(const Napi::Value &value) {
  if (!value.IsString())
    throw std::runtime_error("Expected string");
  return value.As<Napi::String>().Utf8Value();
}
Napi::Value Invoke(const Napi::CallbackInfo &info) {
  try {
    const auto method = Text(info[0]);
    if (method == "shutdown") {
      ReleaseDesktopEngine();
      return info.Env().Null();
    }
    const auto engine = DesktopEngine();
    std::lock_guard<std::mutex> lock(engine->mutex);
    if (!engine->player)
      throw std::runtime_error(engine->error);
    if (method == "load") {
      const auto options = info[3].As<Napi::Object>();
      const auto names = options.GetPropertyNames();
      std::vector<std::pair<std::string, std::string>> values;
      for (uint32_t i = 0; i < names.Length(); ++i) {
        const auto key = Text(names.Get(i));
        values.emplace_back(key, Text(options.Get(key)));
      }
      engine->LoadMedia(Text(info[1]), info[2].As<Napi::Number>().Int64Value(),
                        std::move(values));
    } else if (method == "set") {
      engine->Set(Text(info[1]), Text(info[2]));
    } else if (method == "command") {
      const auto args = info[1].As<Napi::Array>();
      std::vector<std::string> values;
      for (uint32_t i = 0; i < args.Length(); ++i)
        values.push_back(Text(args.Get(i)));
      engine->Command(values);
    } else if (method == "visible")
      engine->window_visible = info[1].As<Napi::Boolean>().Value();
    else if (method != "status")
      throw std::runtime_error("Unknown player method");
    if (!engine->window_visible || engine->video_views == 0)
      engine->SkipVideoFrame();
    const auto state = engine->ReadStatus();
    const bool ready = engine->Ready();
    auto result = Napi::Object::New(info.Env());
    result.Set("videoWidth",
               Napi::Number::New(info.Env(), ready ? state.video_width : 0));
    result.Set("videoHeight",
               Napi::Number::New(info.Env(), ready ? state.video_height : 0));
    result.Set("generation", Napi::Number::New(info.Env(), engine->generation));
    result.Set("ready", Napi::Boolean::New(info.Env(), ready));
    result.Set("completed", Napi::Boolean::New(info.Env(), engine->completed));
    result.Set("positionMs",
               Napi::Number::New(info.Env(),
                                 state.position_seconds.value_or(0) * 1000));
    result.Set("durationMs",
               Napi::Number::New(info.Env(),
                                 ready ? state.duration_seconds * 1000 : 0));
    result.Set(
        "bufferedMs",
        Napi::Number::New(info.Env(),
                          (state.position_seconds.value_or(0) +
                           (ready ? state.buffered_seconds : 0)) * 1000));
    result.Set("paused",
               Napi::Boolean::New(info.Env(), state.paused.value_or(true)));
    result.Set("volume", Napi::Number::New(info.Env(), state.volume / 100));
    result.Set("error", Napi::String::New(info.Env(), engine->error));
    return result;
  } catch (const std::exception &e) {
    Napi::Error::New(info.Env(), e.what()).ThrowAsJavaScriptException();
    return info.Env().Undefined();
  }
}
} // namespace
std::shared_ptr<Engine> DesktopEngine() {
  std::lock_guard<std::mutex> lock(owner_mutex);
  if (!owned_engine)
    owned_engine = std::make_shared<Engine>();
  return owned_engine;
}
void ReleaseDesktopEngine() {
  std::lock_guard<std::mutex> lock(owner_mutex);
  owned_engine.reset();
}
void RegisterPlayer(napi_env env, napi_value exports) {
  Napi::Object(env, exports)
      .Set("videoFormats",
           Napi::Function::New(env, [](const Napi::CallbackInfo &info) {
             auto engine = DesktopEngine();
             auto find = InputFormats();
             auto result = Napi::Array::New(info.Env());
             uint32_t index = 0;
             struct Container {
               const char *demuxer;
               std::vector<std::string> aliases, codecs;
             };
             const std::vector<Container> containers = {
                 {"mov",
                  {"m4a", "mp4", "mov", "m4v", "qt", "3gp", "3g2"},
                  {"h264", "hevc", "mpeg4", "aac"}},
                 {"matroska",
                  {"mkv", "matroska", "webm"},
                  {"h264", "hevc", "vp8", "vp9", "av1", "opus", "aac"}},
                 {"avi", {"avi"}, {"mpeg4", "mjpeg", "mp3"}},
                 {"flv", {"flv"}, {"flv1", "h264", "aac"}},
                 {"mpeg", {"mpg", "mpeg"}, {"mpeg1video", "mpeg2video", "mp2"}},
                 {"mpegts", {"ts"}, {"h264", "hevc", "aac"}},
                 {"asf", {"wmv"}, {"wmv3", "wmav2"}}};
             for (const auto &container : containers) {
               bool supported = find && find(container.demuxer);
               for (const auto &codec : container.codecs)
                 supported = supported && engine->codecs.count(codec);
               if (supported)
                 for (const auto &alias : container.aliases)
                   result.Set(index++, Napi::String::New(info.Env(), alias));
             }
             return result;
           }));
  Napi::Object(env, exports)
      .Set("audioFormats",
           Napi::Function::New(env, [](const Napi::CallbackInfo &info) {
             auto engine = DesktopEngine();
             auto find = InputFormats();
             struct Format {
               const char *name;
               const char *demuxer;
               std::vector<std::string> codecs;
             };
             const std::vector<Format> formats = {
                 {"mp3", "mp3", {"mp3"}},
                 {"flac", "flac", {"flac"}},
                 {"aac", "aac", {"aac"}},
                 {"m4a", "mov", {"aac", "alac"}},
                 {"ogg", "ogg", {"vorbis", "opus", "flac"}},
                 {"opus", "ogg", {"opus"}},
                 {"wav",
                  "wav",
                  {"pcm_s16le", "pcm_s24le", "pcm_s32le", "pcm_f32le"}},
                 {"aiff", "aiff", {"pcm_s16be", "pcm_s24be"}},
                 {"ape", "ape", {"ape"}},
                 {"wma", "asf", {"wmav1", "wmav2", "wmapro", "wmalossless"}},
                 {"mka",
                  "matroska",
                  {"aac", "flac", "opus", "vorbis", "ac3", "dts"}},
                 {"mkv",
                  "matroska",
                  {"aac", "flac", "opus", "vorbis", "ac3", "dts"}},
                 {"webm", "matroska", {"opus", "vorbis"}},
                 {"dsf", "dsf", {"dsd_lsbf_planar"}},
                 {"dff", "dsdiff", {"dsd_msbf", "dst"}},
                 {"alac", "mov", {"alac"}}};
             auto result = Napi::Array::New(info.Env());
             uint32_t index = 0;
             for (const auto &format : formats) {
               bool supported = find && find(format.demuxer);
               for (const auto &codec : format.codecs)
                 supported = supported && engine->codecs.count(codec);
               if (supported)
                 result.Set(index++,
                            Napi::String::New(info.Env(), format.name));
             }
             return result;
           }));
  Napi::Object(env, exports).Set("player", Napi::Function::New(env, Invoke));
  Napi::Object(env, exports)
      .Set("setBridgeToken",
           Napi::Function::New(env, [](const Napi::CallbackInfo &info) {
             SetDesktopBridgeToken(Text(info[0]));
             return info.Env().Undefined();
           }));
}
