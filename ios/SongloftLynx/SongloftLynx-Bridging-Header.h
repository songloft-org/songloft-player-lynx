//
//  Bridging header — the Lynx pods are plain static ObjC libraries (no Swift
//  module), so the Swift host reaches them through these imports. Same set as
//  the official integrating-lynx-demo-projects ios/HelloLynxSwift demo.
//

#import <Lynx/LynxConfig.h>
#import <Lynx/LynxEnv.h>
#import <Lynx/LynxTemplateProvider.h>
#import <Lynx/LynxView.h>

// Native modules (batch B3b) + the load path that carries globalProps into the
// first frame. `LynxContextModule` is the protocol a module adopts to receive a
// `LynxContext` (needed for `sendGlobalEvent`); it pulls in `LynxModule.h` and
// `LynxContext.h` itself.
#import <Lynx/LynxContextModule.h>
#import <Lynx/LynxLoadMeta.h>
#import <Lynx/LynxTemplateData.h>
