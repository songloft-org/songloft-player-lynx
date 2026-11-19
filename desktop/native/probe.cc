#include <lynx/registration.h>
#include <lynx_extension_module.h>
#include <lynx_native_view.h>
#include <mpv/client.h>
#include <mpv/render.h>

#include <algorithm>
#include <cmath>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <vector>

#include "mpv_engine.h"
#include "surface.h"
bool IsDesktopRootEnvironment(Napi::Env env);
bool DesktopProbeEnabled();

namespace {
using lynx::pub::LynxValue;

std::shared_ptr<Engine> GetEngine() { return DesktopEngine(); }

class VideoView : public lynx::pub::LynxNativeView {
public:
  std::shared_ptr<Engine> engine = GetEngine();
  bool IsSurfaceEnabled() override { return true; }
#ifdef __APPLE__
  lynx_surface_buffer_mode_t SurfaceBufferMode() override {
    // Clay flushes and releases the IOSurface after each single-buffer paint.
    // The desktop double-buffer path can exhaust both slots during playback.
    return kSingleBuffer;
  }
#endif
  ~VideoView() override { OnDetach(); }
  void OnAttach() override {
    std::lock_guard<std::mutex> lock(engine->mutex);
    if (!attached_)
      ++engine->video_views;
    attached_ = true;
  }
  void OnDetach() override {
    std::lock_guard<std::mutex> lock(engine->mutex);
    if (attached_)
      --engine->video_views;
    attached_ = false;
  }
  void OnLayoutChanged(float, float, float width, float height,
                       float ratio) override {
    if (!std::isfinite(width) || !std::isfinite(height) ||
        !std::isfinite(ratio) || width <= 0 || height <= 0 || ratio <= 0) {
      width_ = height_ = 0;
      return;
    }
    const double pixels_wide = static_cast<double>(width) * ratio;
    const double pixels_high = static_cast<double>(height) * ratio;
    const double scale =
        std::min({1.0, 3840.0 / pixels_wide, 2160.0 / pixels_high});
    width_ = std::max(1, static_cast<int>(std::round(pixels_wide * scale)));
    height_ = std::max(1, static_cast<int>(std::round(pixels_high * scale)));
    redraw_ = true;
  }
  void
  OnMethodInvoked(const char *method, const LynxValue &attrs,
                  std::function<void(int, LynxValue &&)> callback) override {
    if (std::string(method) != "draw") {
      LynxNativeView::OnMethodInvoked(method, attrs, std::move(callback));
      return;
    }
    std::lock_guard<std::mutex> lock(engine->mutex);
    if (!engine->window_visible) {
      engine->SkipVideoFrame();
      callback(kSuccess, LynxValue(engine->error));
      return;
    }
    if (attached_ && width_ > 0 && height_ > 0 && engine->render) {
      const auto flags = mpv_render_context_update(engine->render);
      if (redraw_ || (flags & MPV_RENDER_UPDATE_FRAME)) {
#ifdef __APPLE__
        auto surface = writer_.Create(width_, height_);
        auto *handle = surface.get();
        if (!handle)
          engine->error = "IOSurfaceCreate failed";
#else
        auto *handle = AcquireSurface(width_, height_);
#endif
        if (handle) {
          pixels_.resize(static_cast<size_t>(width_) * height_ * 4);
          int size[] = {width_, height_};
          size_t stride = static_cast<size_t>(width_) * 4;
          mpv_render_param params[] = {
              {MPV_RENDER_PARAM_SW_SIZE, size},
              {MPV_RENDER_PARAM_SW_FORMAT, const_cast<char *>("bgra")},
              {MPV_RENDER_PARAM_SW_STRIDE, &stride},
              {MPV_RENDER_PARAM_SW_POINTER, pixels_.data()},
              {MPV_RENDER_PARAM_INVALID, nullptr}};
          const int result = mpv_render_context_render(engine->render, params);
          if (result < 0)
            engine->error = mpv_error_string(result);
          else if (writer_.Write(handle, width_, height_, pixels_.data(),
                                 engine->error)) {
#ifdef __APPLE__
            // PresentSurface tries the sink without waiting for a back buffer.
            // Clay retains the IOSurface when accepting an external backing.
            if (PresentSurface(width_, height_, nullptr,
                               static_cast<lynx_surface_handle_t *>(handle))) {
#else
            if (SwapBack()) {
#endif
              ++engine->frames;
              redraw_ = false;
              MarkDirty();
            } else {
#ifdef __APPLE__
              redraw_ = true;
#else
              engine->error = "Lynx SwapBack failed";
#endif
            }
          } else {
            redraw_ = true;
          }
        } else
          engine->SkipVideoFrame();
      }
    }
    callback(kSuccess, LynxValue(engine->error));
  }

private:
  int width_ = 0, height_ = 0;
  bool attached_ = false, redraw_ = true;
  std::vector<uint8_t> pixels_;
  SurfaceWriter writer_;
};

class ProbeModule : public lynx::pub::LynxExtensionModule {
public:
  std::shared_ptr<Engine> engine;
  void OnLynxViewCreate(lynx_view_t *view) override {
    engine = GetEngine();
    lynx_view_register_native_view(
        view, "songloft-mpv-probe",
        [](void *) { return (new VideoView())->native_view(); }, nullptr);
    lynx_view_register_native_view(
        view, "songloft-desktop-video",
        [](void *) { return (new VideoView())->native_view(); }, nullptr);
  }
  Napi::Value Invoke(const Napi::CallbackInfo &info) {
    // Always callback(error, result); no Promise/Node objects cross to Lynx.
    auto env = info.Env();
    if (info.Length() != 3 || !info[0].IsString() || !info[1].IsString() ||
        !info[2].IsFunction()) {
      Napi::TypeError::New(env, "invoke(method, value, callback) required")
          .ThrowAsJavaScriptException();
      return env.Undefined();
    }
    auto callback = info[2].As<Napi::Function>();
    try {
      if (!DesktopProbeEnabled() && !IsDesktopRootEnvironment(env))
        throw std::runtime_error("Root player access required");
      if (!engine)
        throw std::runtime_error("LynxView has no player");
      std::unique_lock<std::mutex> lock(engine->mutex);
      const std::string method = info[0].As<Napi::String>().Utf8Value();
      const std::string value = info[1].As<Napi::String>().Utf8Value();
      if (!engine->player)
        throw std::runtime_error(engine->error);
      if (method == "load") {
        engine->Load(value);
      } else if (method == "pause") {
        if (value != "yes" && value != "no")
          throw std::runtime_error("Pause expects yes or no");
        engine->SetPaused(value == "yes");
      } else if (method != "status") {
        throw std::runtime_error("Unknown probe method");
      }
      const auto snapshot = engine->ReadStatus();
      auto result = Napi::Object::New(env);
      result.Set("lynxSdkVersion",
                 Napi::String::New(env, lynx_env_get_sdk_version()));
      result.Set("positionSeconds",
                 snapshot.position_seconds
                     ? Napi::Number::New(env, *snapshot.position_seconds)
                           .As<Napi::Value>()
                     : env.Null());
      result.Set(
          "paused",
          snapshot.paused
              ? Napi::Boolean::New(env, *snapshot.paused).As<Napi::Value>()
              : env.Null());
      result.Set("submittedFrames",
                 Napi::Number::New(env, static_cast<double>(engine->frames)));
      result.Set("error", Napi::String::New(env, engine->error));
      result.Set(
          "audioOutput",
          snapshot.audio_output
              ? Napi::String::New(env, *snapshot.audio_output).As<Napi::Value>()
              : env.Null());
      lock.unlock();
      callback.Call({env.Null(), result});
    } catch (const std::exception &exception) {
      callback.Call({Napi::String::New(env, exception.what()), env.Null()});
    }
    return env.Undefined();
  }
  static lynx_extension_module_t *Create(void *) {
    auto *module = new ProbeModule();
    auto *handle = lynx_extension_module_create_with_finalizer(
        module, [](lynx_extension_module_t *, void *data) {
          delete static_cast<ProbeModule *>(data);
        });
    module->SetCModule(handle);
    module->SetNapiModuleCreator([](Napi::Env env, Napi::Value exports,
                                    const char *, ProbeModule &self) {
      exports.As<Napi::Object>().Set(
          "invoke",
          Napi::Function::New(env, [&self](const Napi::CallbackInfo &info) {
            return self.Invoke(info);
          }));
      return exports;
    });
    return handle;
  }
};

LYNX_REGISTRATION_CONSTRUCTOR(RegisterProbe) {
  lynx_env_register_extension_module("SongloftDesktopProbe",
                                     ProbeModule::Create, false, nullptr);
}
} // namespace
