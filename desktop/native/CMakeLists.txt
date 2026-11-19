cmake_minimum_required(VERSION 3.21)
project(songloft_mpv_probe LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT WIN32 AND NOT APPLE)
  message(FATAL_ERROR "The desktop native probe supports Windows x64 and macOS arm64/x64 only")
endif()
if(NOT EXISTS "${LYNX_HEADERS}/include/lynx_extension_module.h")
  message(FATAL_ERROR "LYNX_HEADERS must point to @lynx-js/lynx-library-headers 0.0.31")
endif()
find_path(MPV_INCLUDE mpv/render.h PATHS "${MPV_ROOT}/include" NO_DEFAULT_PATH REQUIRED)
find_library(MPV_LIBRARY NAMES mpv mpv-2 libmpv PATHS "${MPV_ROOT}/lib" NO_DEFAULT_PATH REQUIRED)
include("${LYNX_HEADERS}/cmake/lynx-library-headers.cmake")
add_library(songloft_mpv SHARED addon.cc credentials.cc player.cc probe.cc plugin_bridge.cc plugin_frame.cc resources.cc keyboard.cc instance.cc surface.cc)
target_compile_definitions(songloft_mpv PRIVATE BUILDING_NODE_EXTENSION)
# Lynx module callbacks carry Lynx weak N-API environments, whereas the host
# addon entry carries a Node environment. Never mix the two ABI symbol sets.
set_source_files_properties(probe.cc plugin_bridge.cc plugin_frame.cc PROPERTIES COMPILE_DEFINITIONS "USE_WEAK_SUFFIX_NAPI=1;NAPI_CPP_CUSTOM_NAMESPACE=SongloftLynx")
# The header-only C++ wrappers otherwise have identical inline symbol names in
# both ABIs. The linker may coalesce a Lynx wrapper with a Node wrapper even
# though their C calls require different environments.
set_source_files_properties(addon.cc credentials.cc player.cc resources.cc keyboard.cc instance.cc system_win.cc keyboard_win.cc system_mac.mm keyboard_mac.mm PROPERTIES COMPILE_DEFINITIONS NAPI_CPP_CUSTOM_NAMESPACE=SongloftNode)
target_include_directories(songloft_mpv PRIVATE "${LYNX_HEADERS}/include" "${MPV_INCLUDE}")
target_link_libraries(songloft_mpv PRIVATE "${MPV_LIBRARY}")
set_target_properties(songloft_mpv PROPERTIES PREFIX "" SUFFIX ".node"
  LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}"
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}"
  RUNTIME_OUTPUT_DIRECTORY_RELEASE "${CMAKE_BINARY_DIR}"
  LIBRARY_OUTPUT_DIRECTORY_RELEASE "${CMAKE_BINARY_DIR}")
if(WIN32)
  set_property(TARGET songloft_mpv PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")
  target_sources(songloft_mpv PRIVATE system_win.cc keyboard_win.cc)
  target_compile_features(songloft_mpv PRIVATE cxx_std_20)
  target_compile_definitions(songloft_mpv PRIVATE NOMINMAX)
  target_link_libraries(songloft_mpv PRIVATE d3d11 dxgi crypt32 windowsapp advapi32 comctl32)
  lynx_link_lynxtron_runtime(songloft_mpv)
else()
  enable_language(OBJCXX)
  target_sources(songloft_mpv PRIVATE system_mac.mm keyboard_mac.mm)
  set_source_files_properties(system_mac.mm keyboard_mac.mm PROPERTIES COMPILE_OPTIONS "-fobjc-arc")
  target_link_libraries(songloft_mpv PRIVATE "-framework IOSurface" "-framework CoreFoundation" "-framework Security" "-framework AppKit" "-framework MediaPlayer")
  target_link_options(songloft_mpv PRIVATE "-undefined" "dynamic_lookup")
  set_target_properties(songloft_mpv PROPERTIES BUILD_RPATH "${MPV_ROOT}/lib")
endif()
