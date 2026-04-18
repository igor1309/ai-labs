import NotioApp

let config = Config.fromEnvironment()
let app = buildApp(config: config)
try await app.runService()
