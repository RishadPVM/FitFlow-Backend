const AppError = require('../utils/app-error');
const jwtService = require('../services/jwt.service');

const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError('No token provided. Authorization denied.', 401);
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwtService.verifyToken(token);
    
    req.user = decoded;
    next();
  } catch (error) {
    next(new AppError('Invalid token. Authorization denied.', 401));
  }
};

module.exports = { authenticate };
