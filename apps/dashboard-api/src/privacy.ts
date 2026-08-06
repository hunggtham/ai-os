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

export function redactPath(value: string | null | undefined, options: PathRedactionOptions = {}): string | null {
  if (!value) return null;
  if (options.exposeRawPaths || !isAbsolute(value)) return value;

  if (options.repositoryRoot) {
    const repositoryPath = inside(options.repositoryRoot, value);
    if (repositoryPath !== null) return repositoryPath === "." ? "<repo>" : `<repo>/${repositoryPath}`;
  }

  if (options.home) {
    const homePath = inside(options.home, value);
    if (homePath !== null) return homePath === "." ? "~" : `~/${homePath}`;
  }

  return `<local>/${basename(value)}`;
}

export function redactPathFields<T>(value: T, options: PathRedactionOptions = {}): T {
  if (Array.isArray(value)) return value.map((item) => redactPathFields(item, options)) as T;
  if (!value || typeof value !== "object") return value;

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string" && /(?:^|_)(?:path|directory|root)$/i.test(key)) {
      output[key] = redactPath(item, options);
    } else {
      output[key] = redactPathFields(item, options);
    }
  }
  return output as T;
}
