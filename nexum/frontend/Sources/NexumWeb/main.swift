#if canImport(JavaScriptKit)
import JavaScriptKit
import NexumCore

_ = JSObject.global
_ = NexumCoreBootstrap.message()
#else
import NexumCore

print(NexumCoreBootstrap.message())
#endif
