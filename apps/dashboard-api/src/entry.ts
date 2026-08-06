#!/usr/bin/env node
import { homedir } from "node:os";
import { resolve } from "node:path";
import { ServerResponse } from "node:http";
import { redactResponseBody } from "./response-privacy.js";

const exposeRawPaths = process.env.AI_OS_EXPOSE_RAW_PATHS === "true";
const options = {
  exposeRawPaths,
  home: homedir(),
  repositoryRoot: resolve("."),
};

const originalEnd = ServerResponse.prototype.end;
ServerResponse.prototype.end = function patchedEnd(
  chunk?: unknown,
  encodingOrCallback?: BufferEncoding | (() => void),
  callback?: () => void,
): ServerResponse {
  if (typeof chunk === "string") {
    const contentType = this.getHeader("content-type");
    chunk = redactResponseBody(
      chunk,
      typeof contentType === "string" ? contentType : undefined,
      options,
    );
  }

  return originalEnd.call(
    this,
    chunk as never,
    encodingOrCallback as never,
    callback as never,
  );
};

await import("./index.js");
