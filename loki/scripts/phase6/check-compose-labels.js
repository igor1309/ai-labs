import { readFileSync, readdirSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const COMPOSE_FILE_NAME_PATTERN = /^(docker-compose.*|compose.*)\.ya?ml$/i
const REQUIRED_LABELS = ["com.logging.project", "com.logging.service"]

if (isExecutedAsScript()) {
  runCli(process.argv.slice(2))
}

export function runLabelCompliance({ allowlistPath, filePaths, repoRoot }) {
  const normalizedRepoRoot = repoRoot ?? process.cwd()
  const normalizedAllowlistPath = resolvePath(normalizedRepoRoot, allowlistPath)
  const allowlists = parseAllowlistFile(readFileSync(normalizedAllowlistPath, "utf8"))
  const composePaths = normalizeComposePaths(normalizedRepoRoot, filePaths, allowlists.projects)

  const issues = []

  for (const composePath of composePaths) {
    const composeContent = readFileSync(composePath, "utf8")
    const serviceLabels = parseComposeServiceLabels(composeContent)

    for (const serviceLabel of serviceLabels) {
      const validationIssues = validateServiceLabels({
        allowlists,
        composePath,
        serviceLabel
      })
      issues.push(...validationIssues)
    }
  }

  return {
    checkedFiles: composePaths.length,
    issues
  }
}

export function parseAllowlistFile(fileContent) {
  let parsedAllowlist

  try {
    parsedAllowlist = JSON.parse(fileContent)
  } catch (error) {
    throw new Error(`label allowlist file must be valid JSON-compatible YAML: ${error instanceof Error ? error.message : "unknown parse error"}`)
  }

  if (!parsedAllowlist || typeof parsedAllowlist !== "object") {
    throw new Error("label allowlist must be an object")
  }

  if (!Array.isArray(parsedAllowlist.projects) || parsedAllowlist.projects.length === 0) {
    throw new Error("label allowlist must include non-empty projects array")
  }

  if (!parsedAllowlist.projects.every(($0) => isNonEmptyString($0))) {
    throw new Error("label allowlist projects must contain only non-empty strings")
  }

  if (!parsedAllowlist.services || typeof parsedAllowlist.services !== "object") {
    throw new Error("label allowlist must include services object")
  }

  for (const project of parsedAllowlist.projects) {
    const servicesForProject = parsedAllowlist.services[project]
    if (!Array.isArray(servicesForProject) || servicesForProject.length === 0) {
      throw new Error(`label allowlist services must include non-empty array for project '${project}'`)
    }

    if (!servicesForProject.every(($0) => isNonEmptyString($0))) {
      throw new Error(`label allowlist services for project '${project}' must contain only non-empty strings`)
    }
  }

  return parsedAllowlist
}

export function parseComposeServiceLabels(composeContent) {
  const lines = composeContent.split("\n")
  const parsedServices = []
  const servicesIndex = lines.findIndex(($0) => $0.trim() === "services:")

  if (servicesIndex === -1) {
    return parsedServices
  }

  const servicesIndent = indentation(lines[servicesIndex])
  let lineIndex = servicesIndex + 1

  while (lineIndex < lines.length) {
    const currentLine = lines[lineIndex]
    if (isEmptyOrCommentLine(currentLine)) {
      lineIndex += 1
      continue
    }

    const currentIndent = indentation(currentLine)
    if (currentIndent <= servicesIndent) {
      break
    }

    const serviceMatch = currentLine.match(/^(\s*)([A-Za-z0-9_.-]+):\s*$/)
    if (!serviceMatch || currentIndent !== servicesIndent + 2) {
      lineIndex += 1
      continue
    }

    const serviceName = serviceMatch[2]
    const serviceStartIndex = lineIndex
    lineIndex += 1

    while (lineIndex < lines.length) {
      const candidateLine = lines[lineIndex]
      if (isEmptyOrCommentLine(candidateLine)) {
        lineIndex += 1
        continue
      }

      const candidateIndent = indentation(candidateLine)
      const candidateServiceMatch = candidateLine.match(/^(\s*)([A-Za-z0-9_.-]+):\s*$/)
      if (candidateIndent <= servicesIndent) {
        break
      }

      if (candidateServiceMatch && candidateIndent === servicesIndent + 2) {
        break
      }

      lineIndex += 1
    }

    const serviceBlock = lines.slice(serviceStartIndex, lineIndex)
    parsedServices.push({
      labels: parseLabelsFromServiceBlock(serviceBlock),
      serviceName
    })
  }

  return parsedServices
}

// Discovery checks only the compose files of onboarded projects: those in a
// top-level folder the allowlist names. Named files are always checked.
function normalizeComposePaths(repoRoot, filePaths, projects) {
  if (Array.isArray(filePaths) && filePaths.length > 0) {
    return filePaths.map(($0) => resolvePath(repoRoot, $0))
  }

  return discoverComposeFiles(repoRoot).filter(($0) => projects.includes(relative(repoRoot, $0).split("/")[0]))
}

function resolvePath(repoRoot, maybeAbsolutePath) {
  if (typeof maybeAbsolutePath !== "string" || maybeAbsolutePath.length === 0) {
    throw new Error("path arguments must be non-empty strings")
  }

  if (maybeAbsolutePath.startsWith("/")) {
    return maybeAbsolutePath
  }

  return join(repoRoot, maybeAbsolutePath)
}

function discoverComposeFiles(rootDirectory) {
  const discoveredPaths = []
  const queue = [rootDirectory]

  while (queue.length > 0) {
    const currentDirectory = queue.shift()
    if (!currentDirectory) {
      continue
    }

    for (const entry of readdirSync(currentDirectory, { withFileTypes: true })) {
      const entryPath = join(currentDirectory, entry.name)
      if (entry.isDirectory()) {
        if (shouldSkipDirectory(entry.name)) {
          continue
        }

        queue.push(entryPath)
        continue
      }

      if (entry.isFile() && COMPOSE_FILE_NAME_PATTERN.test(entry.name)) {
        discoveredPaths.push(entryPath)
      }
    }
  }

  return discoveredPaths.filter(($0) => !$0.includes("/tests/fixtures/")).sort()
}

function shouldSkipDirectory(directoryName) {
  return directoryName === ".git" || directoryName === "node_modules"
}

function parseLabelsFromServiceBlock(serviceBlock) {
  const labels = {}
  const labelsLineIndex = serviceBlock.findIndex(($0) => $0.trim() === "labels:")

  if (labelsLineIndex === -1) {
    return labels
  }

  const labelsIndent = indentation(serviceBlock[labelsLineIndex])
  for (let lineIndex = labelsLineIndex + 1; lineIndex < serviceBlock.length; lineIndex += 1) {
    const candidateLine = serviceBlock[lineIndex]
    if (isEmptyOrCommentLine(candidateLine)) {
      continue
    }

    const candidateIndent = indentation(candidateLine)
    if (candidateIndent <= labelsIndent) {
      break
    }

    const trimmedLine = candidateLine.trim()
    if (trimmedLine.startsWith("- ")) {
      parseListLabel(trimmedLine.slice(2), labels)
      continue
    }

    parseMapLabel(trimmedLine, labels)
  }

  return labels
}

function parseListLabel(labelEntry, labels) {
  const normalizedEntry = unquote(labelEntry.trim())
  const separatorIndex = normalizedEntry.indexOf("=")
  if (separatorIndex === -1) {
    return
  }

  const key = normalizedEntry.slice(0, separatorIndex).trim()
  const value = normalizedEntry.slice(separatorIndex + 1).trim()

  if (isNonEmptyString(key) && isNonEmptyString(value)) {
    labels[key] = unquote(value)
  }
}

function parseMapLabel(labelEntry, labels) {
  const separatorIndex = labelEntry.indexOf(":")
  if (separatorIndex === -1) {
    return
  }

  const key = labelEntry.slice(0, separatorIndex).trim()
  const value = labelEntry.slice(separatorIndex + 1).trim()

  if (isNonEmptyString(key) && isNonEmptyString(value)) {
    labels[key] = unquote(value)
  }
}

function validateServiceLabels({ allowlists, composePath, serviceLabel }) {
  const issues = []
  const projectValue = serviceLabel.labels["com.logging.project"]
  const serviceValue = serviceLabel.labels["com.logging.service"]
  const relativeComposePath = relative(process.cwd(), composePath)

  for (const requiredLabel of REQUIRED_LABELS) {
    if (!isNonEmptyString(serviceLabel.labels[requiredLabel])) {
      issues.push(`${relativeComposePath}:${serviceLabel.serviceName} missing required label '${requiredLabel}'`)
    }
  }

  if (!isNonEmptyString(projectValue)) {
    return issues
  }

  if (!allowlists.projects.includes(projectValue)) {
    issues.push(`${relativeComposePath}:${serviceLabel.serviceName} has disallowed project label value '${projectValue}'`)
    return issues
  }

  if (!isNonEmptyString(serviceValue)) {
    return issues
  }

  const allowedServices = allowlists.services[projectValue]
  if (!Array.isArray(allowedServices) || !allowedServices.includes(serviceValue)) {
    issues.push(`${relativeComposePath}:${serviceLabel.serviceName} has disallowed service label value '${serviceValue}' for project '${projectValue}'`)
  }

  return issues
}

function runCli(args) {
  try {
    const options = parseArgs(args)
    const result = runLabelCompliance(options)
    if (result.issues.length === 0) {
      process.stdout.write(`ok: checked ${result.checkedFiles} compose file(s)\n`)
      return
    }

    for (const issue of result.issues) {
      process.stderr.write(`fail: ${issue}\n`)
    }

    process.exit(1)
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "unknown error"}\n`)
    process.exit(1)
  }
}

function parseArgs(args) {
  let repoRoot = process.cwd()
  let allowlistPath = "loki/docs/onboarding/label-allowlists.yml"
  const filePaths = []

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]

    if (argument === "--repo-root") {
      repoRoot = requiredValue(args, index)
      index += 1
      continue
    }

    if (argument === "--allowlist-file") {
      allowlistPath = requiredValue(args, index)
      index += 1
      continue
    }

    if (argument === "--compose-file") {
      filePaths.push(requiredValue(args, index))
      index += 1
      continue
    }

    throw new Error(`unknown argument: ${argument}`)
  }

  return { allowlistPath, filePaths, repoRoot }
}

function requiredValue(args, index) {
  const value = args[index + 1]
  if (!isNonEmptyString(value)) {
    throw new Error(`missing value for ${args[index]}`)
  }

  return value
}

function isEmptyOrCommentLine(line) {
  const trimmedLine = line.trim()
  return trimmedLine.length === 0 || trimmedLine.startsWith("#")
}

function indentation(line) {
  return line.length - line.trimStart().length
}

function isExecutedAsScript() {
  if (!isNonEmptyString(process.argv[1])) {
    return false
  }

  return fileURLToPath(import.meta.url) === process.argv[1]
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0
}

function unquote(value) {
  const trimmedValue = value.trim()
  if (trimmedValue.length < 2) {
    return trimmedValue
  }

  if ((trimmedValue.startsWith("\"") && trimmedValue.endsWith("\"")) || (trimmedValue.startsWith("'") && trimmedValue.endsWith("'"))) {
    return trimmedValue.slice(1, -1)
  }

  return trimmedValue
}
