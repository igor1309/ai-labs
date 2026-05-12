export class StartupValidationFailure extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "StartupValidationFailure";
    this.exitCode = 1;
  }
}

export class RuntimeFailure extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "RuntimeFailure";
    this.exitCode = 1;
  }
}

export function failureResult(error, context = {}) {
  return {
    status: "failed",
    exitCode: error?.exitCode ?? 1,
    failureReason: error?.message ?? "unknown failure",
    ...context,
  };
}
