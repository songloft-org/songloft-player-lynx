#pragma once
#include <string>
bool HandleDesktopKey(const std::string &code, bool ctrl, bool meta, bool alt,
                      bool shift, bool editing, bool repeat);
void QueueDesktopWindowClose();
void StartDesktopKeyboard(void *window, bool close_to_tray);
void StopDesktopKeyboard();
