'use strict';

class AppError extends Error {
  constructor(code, message, status = 500) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

const Codes = {
  PATH_ESCAPE: 'PATH_ESCAPE',
  NOT_FOUND: 'NOT_FOUND',
  IS_DIRECTORY: 'IS_DIRECTORY',
  NOT_A_DIRECTORY: 'NOT_A_DIRECTORY',
  EACCES: 'EACCES',
  READ_FAILED: 'READ_FAILED',
  UNSUPPORTED_PLATFORM: 'UNSUPPORTED_PLATFORM',
};

function toResponse(err) {
  if (err instanceof AppError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  }
  return { status: 500, body: { error: { code: Codes.READ_FAILED, message: err.message || '未知错误' } } };
}

module.exports = { AppError, Codes, toResponse };
