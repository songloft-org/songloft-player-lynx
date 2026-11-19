#pragma once
#include <cstdint>
#include <functional>
#include <string>
#include <vector>
using DesktopResourceReply =
    std::function<void(std::vector<uint8_t>, std::string)>;
uint64_t RequestDesktopResource(const std::string &, DesktopResourceReply);
void CancelDesktopResource(uint64_t);
