export const validateRequest = (requiredFields) => {
  return (req, res, next) => {
    const missingFields = [];
    
    requiredFields.forEach(field => {
      if (!req.body[field] || req.body[field].toString().trim() === '') {
        missingFields.push(field);
      }
    });

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        error: "VALIDATION_ERROR"
      });
    }

    // Trim string fields
    requiredFields.forEach(field => {
      if (typeof req.body[field] === 'string') {
        req.body[field] = req.body[field].trim();
      }
    });

    next();
  };
};