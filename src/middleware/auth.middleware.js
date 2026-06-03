const AppError = require('../utils/app-error');
const jwtService = require('../services/jwt.service');

const authenticate = (req, res, next) => {
  try {
    console.log("Authorization:", req.headers.authorization);
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, null, 'No token provided. Authorization denied.');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwtService.verifyToken(token);
    console.log("Decoded Token:", decoded);
    
    req.user = decoded;
    next();
  } catch (error) {
    console.error("Auth error details:", error);
    if (error instanceof AppError) {
      return next(error);
    }
    next(new AppError(401, null, 'Invalid token. Authorization denied.'));
  }
};

module.exports = { authenticate };
