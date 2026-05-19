class AppError extends Error {
  constructor(statusCode = 500, data = null, message = 'Something went wrong') {
    super(message);

    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = false;

    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;