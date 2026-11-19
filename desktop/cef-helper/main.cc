#include "include/cef_app.h"
#include "include/wrapper/cef_message_router.h"
#ifdef __APPLE__
#include "include/wrapper/cef_library_loader.h"
#endif

namespace {
// The server's shared plugin SDK can call the bridge during document load.
// Inject it in the renderer's main context before any page scripts execute.
constexpr char kBridge[] = R"JS(
(() => {
  if (new URLSearchParams(window.location.search).get('songloft_host') !== 'lynx') return;
  window.LynxWebViewBridge = {
    onMessageReceived(json) {
      if (typeof json === 'string') window.cefQuery({ request: 'LyNxSig_' + json });
    },
  };
})();
)JS";

class SongloftRenderer : public CefApp, public CefRenderProcessHandler {
public:
  CefRefPtr<CefRenderProcessHandler> GetRenderProcessHandler() override {
    return this;
  }

  void OnWebKitInitialized() override {
    router_ = CefMessageRouterRendererSide::Create(CefMessageRouterConfig{});
  }

  void OnContextCreated(CefRefPtr<CefBrowser> browser,
                        CefRefPtr<CefFrame> frame,
                        CefRefPtr<CefV8Context> context) override {
    auto main_context = frame->GetV8Context();
    if (frame->IsMain() && main_context && main_context->IsSame(context)) {
      router_->OnContextCreated(browser, frame, context);
      CefRefPtr<CefV8Value> result;
      CefRefPtr<CefV8Exception> error;
      context->Eval(kBridge, "songloft://cef-bridge", 1, result, error);
    }
  }

  void OnContextReleased(CefRefPtr<CefBrowser> browser,
                         CefRefPtr<CefFrame> frame,
                         CefRefPtr<CefV8Context> context) override {
    router_->OnContextReleased(browser, frame, context);
  }

  bool OnProcessMessageReceived(CefRefPtr<CefBrowser> browser,
                                CefRefPtr<CefFrame> frame, CefProcessId source,
                                CefRefPtr<CefProcessMessage> message) override {
    return router_->OnProcessMessageReceived(browser, frame, source, message);
  }

private:
  CefRefPtr<CefMessageRouterRendererSide> router_;
  IMPLEMENT_REFCOUNTING(SongloftRenderer);
};
} // namespace

#ifdef __APPLE__
int main(int argc, char *argv[]) {
  CefScopedLibraryLoader loader;
  if (!loader.LoadInHelper())
    return 1;
  return CefExecuteProcess(CefMainArgs(argc, argv), new SongloftRenderer,
                           nullptr);
}
#else
int APIENTRY wWinMain(HINSTANCE instance, HINSTANCE, LPWSTR, int) {
  return CefExecuteProcess(CefMainArgs(instance), new SongloftRenderer,
                           nullptr);
}
#endif
