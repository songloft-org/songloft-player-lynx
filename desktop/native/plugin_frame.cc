#include "plugin_bridge.h"
#include "resources.h"
#include <algorithm>
#include <lynx/registration.h>
#include <lynx_extension_module.h>
#include <lynx_generic_resource_fetcher.h>
#include <lynx_load_meta.h>
#include <lynx_native_view.h>
#include <lynx_update_meta.h>
#include <map>
#include <mutex>
#include <string>
#ifdef _WIN32
#include <cmath>
#include <cwchar>
#include <windows.h>
#endif

namespace {
using namespace lynx::pub;
#ifdef _WIN32
void RaiseAndPaint(HWND window) {
  if (!IsWindowVisible(window))
    return;
  SetWindowPos(window, HWND_TOP, 0, 0, 0, 0,
               SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE);
  RedrawWindow(window, nullptr, nullptr,
               RDW_INVALIDATE | RDW_ERASE | RDW_ALLCHILDREN | RDW_UPDATENOW);
}
void CALLBACK RepaintFrame(HWND window, UINT, UINT_PTR timer, DWORD) {
  KillTimer(window, timer);
  RaiseAndPaint(window);
}
const auto frame_repaint_timer = reinterpret_cast<UINT_PTR>(&RepaintFrame);
#endif

class Fetcher : public LynxGenericResourceFetcher {
  std::mutex mutex_;
  std::map<lynx_resource_request_id, uint64_t> requests_;

public:
  ~Fetcher() override {
    std::map<lynx_resource_request_id, uint64_t> pending;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      pending.swap(requests_);
    }
    for (const auto &request : pending)
      CancelDesktopResource(request.second);
  }
  void FetchResource(
      std::shared_ptr<resource::LynxResourceRequest> request,
      std::shared_ptr<resource::LynxResourceResponse> response) override {
    const auto id = request->GetRequestId();
    auto weak = std::weak_ptr<Fetcher>(
        std::static_pointer_cast<Fetcher>(shared_from_this()));
    {
      std::lock_guard<std::mutex> lock(mutex_);
      requests_[id] = 0;
    }
    const auto token = RequestDesktopResource(
        request->GetUrl(),
        [response, weak, id](std::vector<uint8_t> bytes, std::string error) {
          if (auto self = weak.lock()) {
            std::lock_guard<std::mutex> lock(self->mutex_);
            self->requests_.erase(id);
          }
          if (!error.empty()) {
            response->SetCode(-1);
            response->SetErrorMessage(error.c_str());
          } else {
            auto *owned = new std::vector<uint8_t>(std::move(bytes));
            response->SetCode(0);
            response->SetData(
                owned->data(), owned->size(),
                [](uint8_t *, size_t, void *data) {
                  delete static_cast<std::vector<uint8_t> *>(data);
                },
                owned);
          }
          response->Complete();
        });
    bool cancelled;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      auto found = requests_.find(id);
      cancelled = found == requests_.end();
      if (!cancelled)
        found->second = token;
    }
    if (cancelled)
      CancelDesktopResource(token);
  }
  void FetchResourcePath(
      std::shared_ptr<resource::LynxResourceRequest>,
      std::shared_ptr<resource::LynxResourceResponse> response) override {
    response->SetCode(-1);
    response->SetErrorMessage("Plugin filesystem paths are unavailable");
    response->Complete();
  }
  void Cancel(lynx_resource_request_id id) override {
    uint64_t token = 0;
    {
      std::lock_guard<std::mutex> lock(mutex_);
      auto found = requests_.find(id);
      if (found != requests_.end()) {
        token = found->second;
        requests_.erase(found);
      }
    }
    if (token)
      CancelDesktopResource(token);
  }
};
class PluginFrame : public LynxNativeView {
  lynx_view_t *parent_;
  std::unique_ptr<LynxView> child_;
  std::shared_ptr<Fetcher> fetcher_;
  std::string url_, loaded_url_, frame_id_, props_ = "{}";
  float x_ = 0, y_ = 0, width_ = 0, height_ = 0, ratio_ = 1;
  bool attached_ = false, visible_ = true, foreground_ = false;
  void Hide() {
    if (!child_ || !foreground_)
      return;
    foreground_ = false;
    child_->OnEnterBackground();
#ifdef _WIN32
    // Retain the swap-chain size while this tab is offscreen.
    auto window = static_cast<HWND>(lynx_view_get_native_window(child_->Impl()));
    KillTimer(window, frame_repaint_timer);
    ShowWindow(window, SW_HIDE);
#else
    child_->SetFrame(x_, y_, 0, 0);
#endif
  }
  void Update(bool layout_changed = false) {
    if (url_.empty() || width_ <= 0 || height_ <= 0 || !attached_ || !visible_) {
      Hide();
      return;
    }
    if (!IsDesktopRootView(parent_) || frame_id_.empty())
      return;
    const bool creating = !child_;
    if (creating) {
      fetcher_ = std::make_shared<Fetcher>();
      LynxView::Builder builder;
      builder.SetParent(lynx_view_get_native_window(parent_))
          .SetFrame(x_, y_, width_, height_)
          .SetScreenSize(width_, height_, ratio_)
          .SetEnableJSRuntime(true)
          .SetGenericResourceFetcher(fetcher_);
      child_ = builder.Build();
      if (!child_)
        return;
      if (!BindDesktopChildFrame(parent_, child_->Impl(), frame_id_)) {
        child_.reset();
        return;
      }
    }
    if (creating || layout_changed || !foreground_) {
      child_->SetFrame(x_, y_, width_, height_);
      child_->UpdateScreenMetrics(width_, height_, ratio_);
#ifdef _WIN32
      // Lynxtron 0.0.31 sizes the Win32 child at (0, 0). Apply the measured
      // origin and request a repaint after the viewport or visibility changes.
      if (auto window = static_cast<HWND>(
              lynx_view_get_native_window(child_->Impl()))) {
        SetWindowPos(window, HWND_TOP, std::lround(x_ * ratio_),
                     std::lround(y_ * ratio_), 0, 0,
                     SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
        // Clay finishes the viewport resize after the native layout callback.
        SetTimer(window, frame_repaint_timer, 100, RepaintFrame);
      }
#endif
    }
    if (loaded_url_ != url_) {
      auto meta = std::make_shared<LynxLoadMeta>();
      meta->SetUrl(url_);
      meta->SetGlobalProps(std::make_shared<LynxTemplateData>(props_));
      child_->LoadTemplate(meta);
      loaded_url_ = url_;
    } else {
      auto meta = std::make_shared<LynxUpdateMeta>();
      meta->SetGlobalProps(std::make_shared<LynxTemplateData>(props_));
      child_->UpdateData(meta);
    }
    if (!foreground_) {
      child_->OnEnterForeground();
      foreground_ = true;
    }
  }

public:
  explicit PluginFrame(lynx_view_t *parent) : parent_(parent) {}
  void OnAttach() override {
    attached_ = true;
    Update();
  }
  void OnDetach() override {
    attached_ = false;
    Hide();
  }
  void OnDestroy() override {
    child_.reset();
    fetcher_.reset();
  }
  void OnLayoutChanged(float x, float y, float width, float height,
                       float ratio) override {
    x_ = x;
    y_ = y;
    width_ = width;
    height_ = height;
    ratio_ = ratio;
    Update(true);
  }
  void OnPropertiesChanged(const LynxValue &attrs, const LynxValue &) override {
    if (attrs.HasProperty("frame-id")) {
      const auto next = attrs.GetProperty("frame-id").StdString();
      if (frame_id_ != next) {
        child_.reset();
        foreground_ = false;
        loaded_url_.clear();
        frame_id_ = next;
      }
    }
    if (attrs.HasProperty("visible"))
      visible_ = attrs.GetProperty("visible").Bool();
    if (attrs.HasProperty("src"))
      url_ = attrs.GetProperty("src").StdString();
    if (attrs.HasProperty("global-props-json"))
      props_ = attrs.GetProperty("global-props-json").StdString();
    Update();
  }
};
class FrameExtension : public LynxExtensionModule {
public:
  void OnLynxViewCreate(lynx_view_t *view) override {
    lynx_view_register_native_view(
        view, "songloft-desktop-plugin-frame",
        [](void *parent) {
          return (new PluginFrame(static_cast<lynx_view_t *>(parent)))
              ->native_view();
        },
        view);
  }
  static lynx_extension_module_t *Create(void *) {
    auto *self = new FrameExtension();
    auto *handle = lynx_extension_module_create_with_finalizer(
        self, [](lynx_extension_module_t *, void *data) {
          delete static_cast<FrameExtension *>(data);
        });
    self->SetCModule(handle);
    return handle;
  }
};
LYNX_REGISTRATION_CONSTRUCTOR(RegisterFrame) {
  lynx_env_register_extension_module("SongloftDesktopPluginFrame",
                                     FrameExtension::Create, false, nullptr);
}
} // namespace

#ifdef _WIN32
void RepaintDesktopCefWindows(void *parent) {
  EnumChildWindows(static_cast<HWND>(parent),
                   [](HWND window, LPARAM) -> BOOL {
                     wchar_t name[32];
                     RECT bounds{};
                     // CEF's windowed host has a Chrome_WidgetWin child in
                     // this app's Lynx viewport. Ignore zero-size parked views.
                     if (GetClassNameW(window, name, 32) &&
                         std::wcsncmp(name, L"Chrome_WidgetWin_", 17) == 0 &&
                         GetClientRect(window, &bounds) && bounds.right > 0 &&
                         bounds.bottom > 0)
                       RaiseAndPaint(window);
                     return TRUE;
                   },
                   0);
}
#endif
