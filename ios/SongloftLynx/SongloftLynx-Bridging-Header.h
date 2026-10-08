//
//  Bridging header — the Lynx pods are plain static ObjC libraries (no Swift
//  module), so the Swift host reaches them through these imports. Same set as
//  the official integrating-lynx-demo-projects ios/HelloLynxSwift demo.
//

#import <Lynx/LynxConfig.h>
#import <Lynx/LynxEnv.h>
#import <Lynx/LynxTemplateProvider.h>
#import <Lynx/LynxDynamicComponentFetcher.h>
#import <Lynx/LynxTemplateResourceFetcher.h>

// Wrap NSData in the SDK response with its explicit Objective-C initializer.
NS_INLINE LynxTemplateResource * _Nonnull SongloftTemplateResourceFromData(NSData * _Nonnull data) {
  return [[LynxTemplateResource alloc] initWithNSData:data];
}
#import <Lynx/LynxView.h>
#import <Lynx/LynxViewClient.h>
#import <Lynx/LynxError.h>

// Native modules (batch B3b) + the load path that carries globalProps into the
// first frame. `LynxContextModule` is the protocol a module adopts to receive a
// `LynxContext` (needed for `sendGlobalEvent`); it pulls in `LynxModule.h` and
// `LynxContext.h` itself.
#import <Lynx/LynxContextModule.h>
#import <Lynx/LynxLoadMeta.h>
#import <Lynx/LynxTemplateData.h>
#import <Lynx/LynxVersion.h>

// Host HTTP service (batch 45). `LynxServiceHttpProtocol.h` transitively brings
// in `LynxHttpRequest`/`LynxHttpResponse`, the `LynxHttpCallback` block typedef,
// `LynxHttpInterceptor` and `LynxHttpStreamingDelegate`; `ServiceAPI.h` is where
// `LynxServices` (the runtime registration entry point) lives. Both are listed
// explicitly rather than relying on that transitivity.
#import <Lynx/LynxServiceHttpProtocol.h>
#import <LynxServiceAPI/ServiceAPI.h>
