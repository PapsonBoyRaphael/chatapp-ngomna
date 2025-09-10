const AgentValidator = require('../../validators/AgentValidator');

/**
 * Validation Middleware
 * 
 * Why middleware validation?
 * - Catches invalid requests early
 * - Consistent error responses
 * - Reduces code duplication
 * - Improves security
 */
const validateMatricule = (req, res, next) => {
  const { error } = AgentValidator.matricule.validate(req.body);
  
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.details[0].message,
      code: 'VALIDATION_ERROR'
    });
  }
  
  next();
};

const validateMatriculeParam = (req, res, next) => {
  const { error } = AgentValidator.matricule.validate({ matricule: req.params.matricule });
  
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
  validateMatricule,
  validateMatriculeParam
};