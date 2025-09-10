const Joi = require('joi');
const { StatusCodes } = require('http-status-codes');

const validateSearch = (req, res, next) => {
  const schema = Joi.object({
    query: Joi.string().allow('').optional(),
    currentAgentRang: Joi.string().optional(),
    currentAgentMatricule: Joi.string().pattern(/^[0-9]{6}[A-Za-z]$/).optional()
  });

  const { error } = schema.validate(req.query);
  if (error) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: error.details[0].message,
      code: 'VALIDATION_ERROR'
    });
  }
  next();
};

const validateLink = (req, res, next) => {
  const schema = Joi.object({
    matricule: Joi.string().pattern(/^[0-9]{6}[A-Za-z]$/).required(),
    unitId: Joi.string().required()
  });

  const { error } = schema.validate(req.body);
  if (error) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      success: false,
      message: error.details[0].message,
      code: 'VALIDATION_ERROR'
    });
  }
  next();
};

module.exports = { validateSearch, validateLink };