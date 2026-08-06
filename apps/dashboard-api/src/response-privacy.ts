import { redactPath, redactPathFields, type PathRedactionOptions } from "./privacy.js";

export function redactResponseBody(
  body: string,
  contentType: string | undefined,
  options: PathRedactionOptions,
): string {
  if (options.exposeRawPaths) return body;

  if (contentType?.includes("application/json")) {
    try {
      return JSON.stringify(redactPathFields(JSON.parse(body) as unknown, options));
    } catch {
      return body;
    }
  }

  if (contentType?.includes("text/html")) {
    return body.replace(
      /(<(?:pre|span class="path")>)([^<]+)(<\/[^>]+>)/g,
      (match, prefix: string, value: string, suffix: string) => {
        const redacted = redactPath(value, options);
        return redacted ? `${prefix}${redacted}${suffix}` : match;
      },
    );
  }

  return body;
}
