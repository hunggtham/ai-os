import { basename, isAbsolute, normalize, relative, sep } from "node:path";

export interface PathRedactionOptions {
  exposeRawPaths?: boolean;
  home?: string;
  repositoryRoot?: string;
}

function inside(root: string, value: string): string | null {
  const candidate = relative(normalize(root), normalize(value));
  if (!candidate || candidate === ".") return ".";
  if (candidate === ".." || candidate.startsWith(`..${sep}`) || isAbsolute(candidate)) return null;
  return candidate.split(sep).join("/");
}

function isWindowsAbsolute(value: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(value);
}

function portableBasename(value: string): string {
  return value.split(/[\\/]/).filter(Boolean).at(-1) ?? basename(value);
}

function isPathField(key: string): boolean {
  const normalized = key.replace(/[_-]/g, "").toLowerCase();
  return normalized === "path"
    || normalized.endsWith("path")
    || normalized.endsWith("directory")
    || normalized.endsWith("root");
}

function isErrorTextField(key: string): boolean {
  const normalized = key.replace(/[_-]/g, "").toLowerCase();
  return normalized === "error" || normalized === "errormessage" || normalized === "message";
}

export function redactPath(value: string | null | undefined, options: PathRedactionOptions = {}): string | null {
  if (!value) return null;
  const windowsAbsolute = isWindowsAbsolute(value);
  if (options.exposeRawPaths || (!isAbsolute(value) && !windowsAbsolute)) return value;

  if (!windowsAbsolute && options.repositoryRoot) {
    const repositoryPath = inside(options.repositoryRoot, value);
    if (repositoryPath !== null) return repositoryPath === "." ? "<repo>" : `<repo>/${repositoryPath}`;
  }

  if (!windowsAbsolute && options.home) {
    const homePath = inside(options.home, value);
    if (homePath !== null) return homePath === "." ? "~" : `~/${homePath}`;
  }

  return `<local>/${portableBasename(value)}`;
}

export function redactTextPaths(value: string, options: PathRedactionOptions = {}): string {
  if (options.exposeRawPaths) return value;
  const redactMatch = (match: string): string => redactPath(match, options) ?? match;
  return value
    .replace(/\/(?:[^/\s'"<>:]+\/)*[^/\s'"<>:]+/g, redactMatch)
    .replace(/[A-Za-z]:\\(?:[^\\\s'"<>:]+\\)*[^\\\s'"<>:]+/g, redactMatch);
}

export function redactPathFields<T>(value: T, options: PathRedactionOptions = {}): T {
  if (Array.isArray(value)) return value.map((item) => redactPathFields(item, options)) as T;
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string" && isPathField(key)) {
      output[key] = redactPath(item, options);
    } else if (typeof item === "string" && isErrorTextField(key)) {
      output[key] = redactTextPaths(item, options);
    } else {
      output[key] = redactPathFields(item, options);
    }
  }
  return output as T;
}
