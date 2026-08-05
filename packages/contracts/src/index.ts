import Ajv, { type ErrorObject, type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

export interface ValidationResult<T> {
  valid: boolean;
  value?: T;
  errors: ErrorObject[];
}

export function createValidator<T>(schema: object): (value: unknown) => ValidationResult<T> {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  const validate: ValidateFunction<T> = ajv.compile<T>(schema);

  return (value: unknown): ValidationResult<T> => {
    const valid = validate(value);
    return valid
      ? { valid: true, value: value as T, errors: [] }
      : { valid: false, errors: validate.errors ?? [] };
  };
}
