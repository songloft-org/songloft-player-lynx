#include <mutex>
#include <node_api.h>
#include <roapi.h>
#include <string>
#include <systemmediatransportcontrolsinterop.h>
#include <third_party/weak-node-api/headers/napi.h>
#include <vector>
#include <windows.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Media.h>

namespace {
using winrt::check_hresult;
using winrt::event_token;
using winrt::get_activation_factory;
using winrt::guid_of;
using winrt::hresult_error;
using winrt::put_abi;
using winrt::to_hstring;
using winrt::to_string;
using winrt::Windows::Foundation::TimeSpan;
using winrt::Windows::Media::MediaPlaybackStatus;
using winrt::Windows::Media::MediaPlaybackType;
using winrt::Windows::Media::SystemMediaTransportControls;
using winrt::Windows::Media::SystemMediaTransportControlsButton;
using winrt::Windows::Media::SystemMediaTransportControlsTimelineProperties;
SystemMediaTransportControls controls{nullptr};
bool apartment_owned = false;
event_token buttons{}, position_token{};
std::mutex intent_mutex;
std::vector<std::pair<std::string, double>> intents;
void Push(std::string command, double position = 0) {
  std::lock_guard<std::mutex> lock(intent_mutex);
  if (intents.size() < 128)
    intents.emplace_back(std::move(command), position);
}
std::string Text(Napi::Object data, const char *key) {
  auto value = data.Get(key);
  return value.IsString() ? value.As<Napi::String>().Utf8Value() : "";
}
double Number(Napi::Object data, const char *key) {
  auto value = data.Get(key);
  return value.IsNumber() ? value.As<Napi::Number>().DoubleValue() : 0;
}
void Close() {
  if (controls) {
    controls.ButtonPressed(buttons);
    controls.PlaybackPositionChangeRequested(position_token);
    controls.IsEnabled(false);
    controls.DisplayUpdater().ClearAll();
    controls.DisplayUpdater().Update();
    controls = nullptr;
  }
  if (apartment_owned) {
    RoUninitialize();
    apartment_owned = false;
  }
}
Napi::Value Media(const Napi::CallbackInfo &info) {
  try {
    auto env = info.Env();
    auto method = info[0].As<Napi::String>().Utf8Value();
    if (method == "initialize") {
      Close();
      const HRESULT apartment = RoInitialize(RO_INIT_MULTITHREADED);
      if (FAILED(apartment) && apartment != RPC_E_CHANGED_MODE)
        check_hresult(apartment);
      apartment_owned = SUCCEEDED(apartment);
      auto buffer = info[1].As<Napi::Buffer<uint8_t>>();
      if (buffer.Length() != sizeof(HWND))
        throw std::runtime_error("Invalid native window handle");
      HWND window;
      memcpy(&window, buffer.Data(), sizeof(window));
      auto factory =
          get_activation_factory<SystemMediaTransportControls,
                                 ISystemMediaTransportControlsInterop>();
      check_hresult(factory->GetForWindow(
          window, guid_of<SystemMediaTransportControls>(), put_abi(controls)));
      controls.IsEnabled(true);
      controls.IsPlayEnabled(true);
      controls.IsPauseEnabled(true);
      controls.IsStopEnabled(true);
      controls.IsNextEnabled(true);
      controls.IsPreviousEnabled(true);
      buttons = controls.ButtonPressed([](auto const &, auto const &event) {
        switch (event.Button()) {
        case SystemMediaTransportControlsButton::Play:
          Push("play");
          break;
        case SystemMediaTransportControlsButton::Pause:
          Push("pause");
          break;
        case SystemMediaTransportControlsButton::Stop:
          Push("stop");
          break;
        case SystemMediaTransportControlsButton::Next:
          Push("next");
          break;
        case SystemMediaTransportControlsButton::Previous:
          Push("previous");
          break;
        default:
          break;
        }
      });
      position_token = controls.PlaybackPositionChangeRequested(
          [](auto const &, auto const &event) {
            Push("seek", event.RequestedPlaybackPosition().count() / 10000.0);
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
    } else if (method == "update" && controls) {
      auto data = info[1].As<Napi::Object>();
      auto updater = controls.DisplayUpdater();
      updater.Type(MediaPlaybackType::Music);
      updater.MusicProperties().Title(to_hstring(Text(data, "title")));
      updater.MusicProperties().Artist(to_hstring(Text(data, "artist")));
      updater.MusicProperties().AlbumTitle(to_hstring(Text(data, "album")));
      updater.Update();
      controls.PlaybackStatus(Text(data, "state") == "playing"
                                  ? MediaPlaybackStatus::Playing
                                  : MediaPlaybackStatus::Paused);
      SystemMediaTransportControlsTimelineProperties timeline;
      timeline.StartTime(TimeSpan{0});
      timeline.MinSeekTime(TimeSpan{0});
      const auto end =
          TimeSpan{static_cast<int64_t>(Number(data, "durationMs") * 10000)};
      timeline.EndTime(end);
      timeline.MaxSeekTime(end);
      timeline.Position(
          TimeSpan{static_cast<int64_t>(Number(data, "positionMs") * 10000)});
      controls.UpdateTimelineProperties(timeline);
    } else if (method == "clear" && controls) {
      controls.PlaybackStatus(MediaPlaybackStatus::Stopped);
      controls.DisplayUpdater().ClearAll();
      controls.DisplayUpdater().Update();
    } else if (method == "close")
      Close();
    else if (method != "clear" && method != "update")
      throw std::runtime_error("Unknown media method");
    return env.Null();
  } catch (const hresult_error &) {
    Napi::Error::New(info.Env(), "Windows media control initialization failed")
        .ThrowAsJavaScriptException();
    return info.Env().Undefined();
  } catch (const std::exception &error) {
    Napi::Error::New(info.Env(), error.what()).ThrowAsJavaScriptException();
    return info.Env().Undefined();
  }
}
Napi::Value System(const Napi::CallbackInfo &info) {
  auto env = info.Env();
  auto result = Napi::Object::New(env);
  DWORD light = 1, transparency = 1, size = sizeof(DWORD);
  const wchar_t *path =
      L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize";
  if (RegGetValueW(HKEY_CURRENT_USER, path, L"AppsUseLightTheme",
                   RRF_RT_REG_DWORD, nullptr, &light, &size) == ERROR_SUCCESS)
    result.Set("systemTheme", Napi::String::New(env, light ? "light" : "dark"));
  size = sizeof(DWORD);
  if (RegGetValueW(HKEY_CURRENT_USER, path, L"EnableTransparency",
                   RRF_RT_REG_DWORD, nullptr, &transparency,
                   &size) == ERROR_SUCCESS)
    result.Set("systemReduceTransparency",
               Napi::Boolean::New(env, !transparency));
  wchar_t locale[LOCALE_NAME_MAX_LENGTH];
  if (GetUserDefaultLocaleName(locale, LOCALE_NAME_MAX_LENGTH))
    result.Set("systemLocale", Napi::String::New(env, to_string(locale)));
  BOOL animations;
  if (SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, &animations, 0))
    result.Set("systemReduceMotion", Napi::Boolean::New(env, !animations));
  HIGHCONTRASTW contrast{sizeof(HIGHCONTRASTW)};
  if (SystemParametersInfoW(SPI_GETHIGHCONTRAST, sizeof(contrast), &contrast,
                            0))
    result.Set("systemIncreaseContrast",
               Napi::Boolean::New(env, contrast.dwFlags & HCF_HIGHCONTRASTON));
  return result;
}

} // namespace
void RegisterSystem(napi_env env, napi_value exports) {
  Napi::Object(env, exports)
      .Set("systemAppearance", Napi::Function::New(env, System));
  Napi::Object(env, exports).Set("media", Napi::Function::New(env, Media));
}
