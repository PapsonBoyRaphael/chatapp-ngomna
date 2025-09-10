const { StatusCodes } = require('http-status-codes');
const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error('Error:', err);

  let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;
  let message = 'Internal server error';
  let code = 'INTERNAL_ERROR';

  if (err.name === 'ValidationError' || err.message.includes('must be')) {
    statusCode = StatusCodes.BAD_REQUEST;
    message = err.message;
    code = 'VALIDATION_ERROR';
  } else if (err.message.includes('not found')) {
    statusCode = StatusCodes.NOT_FOUND;
    message = err.message;
    code = 'NOT_FOUND';
  }

  res.status(statusCode).json({
    success: false,
    message,
    code,
    timestamp: new Date().toISOString()
  });
};

module.exports = errorHandler;