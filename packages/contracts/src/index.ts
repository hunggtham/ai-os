import * as AjvModule from "ajv";
import * as addFormatsModule from "ajv-formats";
import type { ErrorObject, ValidateFunction } from "ajv";

interface AjvLike {
  compile<T>(schema: object): ValidateFunction<T>;
}

type AjvConstructor = new (options: { allErrors: boolean; strict: boolean }) => AjvLike;
type AddFormats = (ajv: AjvLike) => void;

function resolveDefault<T>(module: unknown): T {
  const candidate = module as { default?: T };
  return candidate.default ?? (module as T);
}

const Ajv = resolveDefault<AjvConstructor>(AjvModule);
const addFormats = resolveDefault<AddFormats>(addFormatsModule);

export interface ValidationResult<T> {
  valid: boolean;
  value?: T;
  errors: ErrorObject[];
}

export function createValidator<T>(schema: object): (value: unknown) => ValidationResult<T> {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate = ajv.compile<T>(schema);

  return (value: unknown): ValidationResult<T> => {
    const valid = validate(value);
    return valid
      ? { valid: true, value: value as T, errors: [] }
      : { valid: false, errors: validate.errors ?? [] };
  };
}
