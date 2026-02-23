import { renderCloudInit } from "./generate-cloud-init.js"

try {
  const options = parseArgs(process.argv.slice(2))
  process.stdout.write(renderCloudInit(options))
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : "unknown error"}\n`)
  process.exit(1)
}

function parseArgs(args) {
  let adminUser
  let deployEnv
  const sshAuthorizedKeys = []

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]

    if (argument === "--admin-user") {
      adminUser = requiredValue(args, index)
      index += 1
      continue
    }

    if (argument === "--deploy-env") {
      deployEnv = requiredValue(args, index)
      index += 1
      continue
    }

    if (argument === "--ssh-authorized-key") {
      sshAuthorizedKeys.push(requiredValue(args, index))
      index += 1
      continue
    }

    throw new Error(`unknown argument: ${argument}`)
  }

  return { adminUser, deployEnv, sshAuthorizedKeys }
}

function requiredValue(args, index) {
  const value = args[index + 1]
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`missing value for ${args[index]}`)
  }

  return value
}

