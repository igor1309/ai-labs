import NexumBackend

let configuration = try NexumServerConfiguration.fromProcessEnvironment()
let app = try NexumServerBootstrap.makeApplication(configuration: configuration)
_ = NexumBackendModule.self
try await app.runService()
