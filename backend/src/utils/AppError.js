/**
 * An error that is safe to show to API clients.
 * `status` is the HTTP status code, `code` is a stable machine-readable string.
 */
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}
