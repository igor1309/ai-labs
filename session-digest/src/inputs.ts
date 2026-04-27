import type * as fs from "node:fs";

const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export type StatFs = Pick<typeof fs.promises, "stat">;
export type ReadFileFs = Pick<typeof fs.promises, "readFile">;

export type Message = {
  role: string;
  content: string;
};

export class InputError extends Error {
  static missingFile(path: string): InputError {
    return new InputError(`Input file does not exist: ${path}`);
  }

  static notAFile(path: string): InputError {
    return new InputError(`Input path is not a file: ${path}`);
  }

  static unreadable(path: string, code: string): InputError {
    return new InputError(`Input file is unreadable (${code}): ${path}`);
  }

  static emptyFile(path: string): InputError {
    return new InputError(`Input file is empty: ${path}`);
  }

  static oversize(path: string): InputError {
    return new InputError(`Input file exceeds 25 MB max size: ${path}`);
  }

  static nonJsonl(path: string): InputError {
    return new InputError(`Input file is not valid JSONL: ${path}`);
  }

  static noUsableMessages(path: string): InputError {
    return new InputError(`Input JSONL contains no usable Claude Code messages: ${path}`);
  }
}

export async function parseSession(inputPath: string, fsLike: ReadFileFs): Promise<Message[]> {
  let contents: string;

  try {
    contents = await fsLike.readFile(inputPath, "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "EACCES") {
      throw InputError.unreadable(inputPath, error.code);
    }

    throw error;
  }

  let parsedValues = 0;
  const messages: Message[] = [];

  for (const line of contents.split(/\r?\n/)) {
    if (line.trim() === "") {
      continue;
    }

    try {
      const value = JSON.parse(line) as unknown;
      parsedValues += 1;
      const message = usableMessage(value);

      if (message) {
        messages.push(message);
      }
    } catch {
      continue;
    }
  }

  if (parsedValues === 0) {
    throw InputError.nonJsonl(inputPath);
  }

  if (messages.length === 0) {
    throw InputError.noUsableMessages(inputPath);
  }

  return messages;
}

function usableMessage(value: unknown): Message | undefined {
  if (!isRecord(value) || (value.type !== "user" && value.type !== "assistant")) {
    return undefined;
  }

  if (!isRecord(value.message) || typeof value.message.role !== "string" || value.message.role === "") {
    return undefined;
  }

  const content = flattenContent(value.message.content);

  if (content === "") {
    return undefined;
  }

  return {
    role: value.message.role,
    content,
  };
}

function flattenContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content.map(textFromBlock).join("");
  }

  return "";
}

function textFromBlock(block: unknown): string {
  if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string" || block.text === "") {
    return "";
  }

  return block.text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export async function validateInputPath(inputPath: string, fsLike: StatFs): Promise<void> {
  let stats: Awaited<ReturnType<StatFs["stat"]>>;

  try {
    stats = await fsLike.stat(inputPath);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      throw InputError.missingFile(inputPath);
    }

    if (isNodeError(error) && error.code === "EACCES") {
      throw InputError.unreadable(inputPath, error.code);
    }

    throw error;
  }

  if (!stats.isFile()) {
    throw InputError.notAFile(inputPath);
  }

  if (stats.size === 0) {
    throw InputError.emptyFile(inputPath);
  }

  if (stats.size > MAX_INPUT_BYTES) {
    throw InputError.oversize(inputPath);
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
