import { AppError } from '../utils/AppError.js';

function sendError(res, status, code, message) {
  res.status(status).json({ success: false, error: { code, message } });
}

export function notFoundHandler(req, res) {
  sendError(res, 404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} does not exist.`);
}

// Turns every error into the standard { success: false, error } shape.
// Stack traces and internal details are only logged on the server, never sent.
// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return sendError(res, err.status, err.code, err.message);
  }
  if (err?.type === 'entity.parse.failed') {
    return sendError(res, 400, 'INVALID_JSON', 'The request body must be valid JSON.');
  }
  if (err?.type === 'entity.too.large') {
    return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.');
  }

  console.error('Unexpected error:', err?.message ?? err);
  return sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong while scanning the repository. Please try again.');
}
