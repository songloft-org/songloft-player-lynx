#include "keyboard.h"
#import <AppKit/AppKit.h>
#include <cstring>
#include <map>
#import <objc/runtime.h>

namespace {
id monitor;
NSWindow *scope;
bool IsEditing(NSResponder *responder) {
  if ([responder isKindOfClass:[NSTextView class]] ||
      [responder isKindOfClass:[NSTextField class]])
    return true;
  if (![responder conformsToProtocol:@protocol(NSTextInputClient)])
    return false;
  // The pinned embedder's Metal view implements NSTextInputClient even when
  // no editor is focused. Its active flag is set by the text-input delegate.
  // Treat unknown input-client implementations conservatively as editing.
  if ([responder respondsToSelector:@selector(setTextInputActive:)]) {
    Ivar flag =
        class_getInstanceVariable([responder class], "_textInputActive");
    if (flag) {
      const char *type = ivar_getTypeEncoding(flag);
      if (type && (*type == 'B' || *type == 'c' || *type == 'C')) {
        BOOL active = YES;
        std::memcpy(
            &active,
            static_cast<const char *>((__bridge const void *)responder) +
                ivar_getOffset(flag),
            sizeof(active));
        return active;
      }
    }
  }
  return true;
}
std::string Code(unsigned short key) {
  static const std::map<unsigned short, std::string> codes = {
      {0, "KeyA"},         {11, "KeyB"},        {8, "KeyC"},
      {2, "KeyD"},         {14, "KeyE"},        {3, "KeyF"},
      {5, "KeyG"},         {4, "KeyH"},         {34, "KeyI"},
      {38, "KeyJ"},        {40, "KeyK"},        {37, "KeyL"},
      {46, "KeyM"},        {45, "KeyN"},        {31, "KeyO"},
      {35, "KeyP"},        {12, "KeyQ"},        {15, "KeyR"},
      {1, "KeyS"},         {17, "KeyT"},        {32, "KeyU"},
      {9, "KeyV"},         {13, "KeyW"},        {7, "KeyX"},
      {16, "KeyY"},        {6, "KeyZ"},         {29, "Digit0"},
      {18, "Digit1"},      {19, "Digit2"},      {20, "Digit3"},
      {21, "Digit4"},      {23, "Digit5"},      {22, "Digit6"},
      {26, "Digit7"},      {28, "Digit8"},      {25, "Digit9"},
      {49, "Space"},       {53, "Escape"},      {123, "ArrowLeft"},
      {124, "ArrowRight"}, {125, "ArrowDown"},  {126, "ArrowUp"},
      {36, "Enter"},       {48, "Tab"},         {51, "Backspace"},
      {117, "Delete"},     {50, "Backquote"},   {27, "Minus"},
      {24, "Equal"},       {33, "BracketLeft"}, {30, "BracketRight"},
      {42, "Backslash"},   {41, "Semicolon"},   {39, "Quote"},
      {43, "Comma"},       {47, "Period"},      {44, "Slash"},
      {122, "F1"},         {120, "F2"},         {99, "F3"},
      {118, "F4"},         {96, "F5"},          {97, "F6"},
      {98, "F7"},          {100, "F8"},         {101, "F9"},
      {109, "F10"},        {103, "F11"},        {111, "F12"},
      {115, "Home"},       {119, "End"},        {116, "PageUp"},
      {121, "PageDown"},
  };
  auto found = codes.find(key);
  return found == codes.end() ? "" : found->second;
}
void Main(dispatch_block_t block) {
  if ([NSThread isMainThread])
    block();
  else
    dispatch_sync(dispatch_get_main_queue(), block);
}
} // namespace
void StartDesktopKeyboard(void *handle, bool /*close_to_tray*/) {
  Main(^{
    if (monitor)
      [NSEvent removeMonitor:monitor];
    id object = (__bridge id)handle;
    scope = [object isKindOfClass:[NSWindow class]] ? object
                                                    : [(NSView *)object window];
    monitor = [NSEvent
        addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown
                                     handler:^NSEvent *(NSEvent *event) {
                                       if (event.window != scope ||
                                           ![NSApp isActive])
                                         return event;
                                       NSResponder *responder =
                                           scope.firstResponder;
                                       const bool editing =
                                           IsEditing(responder);
                                       const auto flags = event.modifierFlags;
                                       return HandleDesktopKey(
                                                  Code(event.keyCode),
                                                  flags &
                                                      NSEventModifierFlagControl,
                                                  flags &
                                                      NSEventModifierFlagCommand,
                                                  flags &
                                                      NSEventModifierFlagOption,
                                                  flags &
                                                      NSEventModifierFlagShift,
                                                  editing, event.isARepeat)
                                                  ? nil
                                                  : event;
                                     }];
  });
}
void StopDesktopKeyboard() {
  Main(^{
    if (monitor)
      [NSEvent removeMonitor:monitor];
    monitor = nil;
    scope = nil;
  });
}
