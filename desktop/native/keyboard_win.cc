#include "keyboard.h"
#include <map>
#include <stdexcept>
#include <windows.h>
#include <commctrl.h>

namespace {
HHOOK hook;
HWND scope;
constexpr UINT_PTR close_subclass_id = 1;
bool close_subclass_installed;

LRESULT CALLBACK CloseToTray(HWND window, UINT message, WPARAM wparam,
                             LPARAM lparam, UINT_PTR id, DWORD_PTR) {
  // Lynxtron 0.0.31 does not send a cancellable close event on Windows.
  if (message == WM_CLOSE ||
      (message == WM_SYSCOMMAND && (wparam & 0xfff0) == SC_CLOSE)) {
    QueueDesktopWindowClose();
    return 0;
  }
  if (message == WM_NCDESTROY) {
    RemoveWindowSubclass(window, CloseToTray, id);
    close_subclass_installed = false;
  }
  return DefSubclassProc(window, message, wparam, lparam);
}

std::string Code(const MSG &event) {
  const unsigned scan = (event.lParam >> 16) & 0xff;
  static const std::map<unsigned, char> letters = {
      {0x1e, 'A'}, {0x30, 'B'}, {0x2e, 'C'}, {0x20, 'D'}, {0x12, 'E'},
      {0x21, 'F'}, {0x22, 'G'}, {0x23, 'H'}, {0x17, 'I'}, {0x24, 'J'},
      {0x25, 'K'}, {0x26, 'L'}, {0x32, 'M'}, {0x31, 'N'}, {0x18, 'O'},
      {0x19, 'P'}, {0x10, 'Q'}, {0x13, 'R'}, {0x1f, 'S'}, {0x14, 'T'},
      {0x16, 'U'}, {0x2f, 'V'}, {0x11, 'W'}, {0x2d, 'X'}, {0x15, 'Y'},
      {0x2c, 'Z'}};
  if (auto found = letters.find(scan); found != letters.end())
    return std::string("Key") + found->second;
  if (scan >= 2 && scan <= 10)
    return std::string("Digit") + static_cast<char>('1' + scan - 2);
  if (scan == 11)
    return "Digit0";
  if (event.wParam >= VK_F1 && event.wParam <= VK_F24)
    return "F" + std::to_string(event.wParam - VK_F1 + 1);
  static const std::map<WPARAM, std::string> names = {
      {VK_SPACE, "Space"},      {VK_ESCAPE, "Escape"},
      {VK_LEFT, "ArrowLeft"},   {VK_RIGHT, "ArrowRight"},
      {VK_UP, "ArrowUp"},       {VK_DOWN, "ArrowDown"},
      {VK_RETURN, "Enter"},     {VK_TAB, "Tab"},
      {VK_BACK, "Backspace"},   {VK_DELETE, "Delete"},
      {VK_HOME, "Home"},        {VK_END, "End"},
      {VK_PRIOR, "PageUp"},     {VK_NEXT, "PageDown"},
      {VK_OEM_MINUS, "Minus"},  {VK_OEM_PLUS, "Equal"},
      {VK_OEM_1, "Semicolon"},  {VK_OEM_2, "Slash"},
      {VK_OEM_3, "Backquote"},  {VK_OEM_4, "BracketLeft"},
      {VK_OEM_5, "Backslash"},  {VK_OEM_6, "BracketRight"},
      {VK_OEM_7, "Quote"},      {VK_OEM_COMMA, "Comma"},
      {VK_OEM_PERIOD, "Period"}};
  auto found = names.find(event.wParam);
  return found == names.end() ? "" : found->second;
}
LRESULT CALLBACK KeyboardHook(int code, WPARAM removed, LPARAM argument) {
  if (code >= 0 && removed == PM_REMOVE) {
    auto *event = reinterpret_cast<MSG *>(argument);
    if ((event->message == WM_KEYDOWN || event->message == WM_SYSKEYDOWN) &&
        (event->hwnd == scope || IsChild(scope, event->hwnd)) &&
        GetForegroundWindow() == scope) {
      GUITHREADINFO info{sizeof(GUITHREADINFO)};
      const bool editing =
          GetGUIThreadInfo(GetWindowThreadProcessId(scope, nullptr), &info) &&
          info.hwndCaret;
      if (HandleDesktopKey(Code(*event), GetKeyState(VK_CONTROL) < 0,
                           GetKeyState(VK_LWIN) < 0 || GetKeyState(VK_RWIN) < 0,
                           GetKeyState(VK_MENU) < 0, GetKeyState(VK_SHIFT) < 0,
                           editing, (event->lParam & (1LL << 30)) != 0))
        event->message = WM_NULL;
    }
  }
  return CallNextHookEx(hook, code, removed, argument);
}
} // namespace
void StartDesktopKeyboard(void *window, bool close_to_tray) {
  StopDesktopKeyboard();
  scope = static_cast<HWND>(window);
  hook = SetWindowsHookExW(WH_GETMESSAGE, KeyboardHook, nullptr,
                           GetWindowThreadProcessId(scope, nullptr));
  if (!hook)
    throw std::runtime_error("Window keyboard hook failed");
  if (close_to_tray) {
    close_subclass_installed =
        SetWindowSubclass(scope, CloseToTray, close_subclass_id, 0);
    if (!close_subclass_installed) {
      StopDesktopKeyboard();
      throw std::runtime_error("Window close handler failed");
    }
  }
}
void StopDesktopKeyboard() {
  if (close_subclass_installed)
    RemoveWindowSubclass(scope, CloseToTray, close_subclass_id);
  close_subclass_installed = false;
  if (hook)
    UnhookWindowsHookEx(hook);
  hook = nullptr;
  scope = nullptr;
}
