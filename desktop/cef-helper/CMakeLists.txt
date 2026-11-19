cmake_minimum_required(VERSION 3.21)
project(songloft_cef_helper LANGUAGES C CXX)

# Match the official CEF extension's subprocess settings. The parent still
# initializes CEF and owns the browser and windowless surfaces.
set(USE_SANDBOX OFF CACHE BOOL "Match the CEF extension" FORCE)
list(APPEND CMAKE_MODULE_PATH "${CEF_ROOT}/cmake")
find_package(CEF REQUIRED)
add_subdirectory("${CEF_LIBCEF_DLL_WRAPPER_PATH}" libcef_dll_wrapper)

add_executable(songloft_cef_helper WIN32 main.cc)
set_target_properties(songloft_cef_helper PROPERTIES
  CXX_STANDARD 17
  CXX_STANDARD_REQUIRED ON
  RUNTIME_OUTPUT_DIRECTORY_RELEASE "${CMAKE_BINARY_DIR}"
)
target_include_directories(songloft_cef_helper PRIVATE "${CEF_ROOT}")
target_link_libraries(songloft_cef_helper PRIVATE libcef_dll_wrapper ${CEF_STANDARD_LIBS})
if(WIN32)
  ADD_LOGICAL_TARGET(cef_import_library "${CEF_LIB_DEBUG}" "${CEF_LIB_RELEASE}")
  target_link_libraries(songloft_cef_helper PRIVATE cef_import_library)
endif()
SET_EXECUTABLE_TARGET_PROPERTIES(songloft_cef_helper)
