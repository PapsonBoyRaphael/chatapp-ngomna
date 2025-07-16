const VisibilityValidator = require('../../validators/VisibilityValidator');

/**
 * Validation Middleware for Visibility Service
 */
const validateSearchUnits = (req, res, next) => {
  const { error } = VisibilityValidator.searchUnits.validate(req.query);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
      code: 'VALIDATION_ERROR'
    });
  }
  
  next();
};

const validateAttachAgent = (req, res, next) => {
  const { error } = VisibilityValidator.attachAgent.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
      code: 'VALIDATION_ERROR'
    });
  }
  
  next();
};

const validateSearchAgents = (req, res, next) => {
  const { error } = VisibilityValidator.searchAgents.validate(req.query);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
      code: 'VALIDATION_ERROR'
    });
  }
  
  next();
};

module.exports = {
  validateSearchUnits,
  validateAttachAgent,
  validateSearchAgents
};