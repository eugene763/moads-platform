export class PlatformError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "PlatformError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function assertOrThrow(
  condition: unknown,
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
): asserts condition {
  if (!condition) {
    throw new PlatformError(statusCode, code, message, details);
  }
}
