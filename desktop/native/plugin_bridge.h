#pragma once
#include <capi/lynx_view_capi.h>
#include <string>
bool IsDesktopRootView(lynx_view_t *);
bool BindDesktopChildFrame(lynx_view_t *parent, lynx_view_t *child,
                           const std::string &frame);
