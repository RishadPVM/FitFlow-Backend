const AppError = require('../utils/app-error');

const errorHandler = (err, req, res, next) => {
  console.error('❌ Error:', err);

  // Prisma unique constraint error
  if (err.code === 'P2002') {
    return res.status(409).json({
      statusCode: 409,
      success: false,
      message: 'Duplicate entry found',
      data: null,
    });
  }

  // Prisma record not found
  if (err.code === 'P2025') {
    return res.status(404).json({
      statusCode: 404,
      success: false,
      message: 'Record not found',
      data: null,
    });
  }

  // Get status code safely
  const statusCode = Number(err.statusCode) || Number(err.status) || 500;

  // Custom AppError
  if (err instanceof AppError) {
    return res.status(statusCode).json({
      statusCode,
      success: false,
      message: err.message,
      data: err.data || null,
    });
  }

  // Validation errors or other JS errors
  return res.status(statusCode).json({
    statusCode,
    success: false,
    message: err.message || 'Internal Server Error',
    data: null,
  });
};

module.exports = errorHandler;