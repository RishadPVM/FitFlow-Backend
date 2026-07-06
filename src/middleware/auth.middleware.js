const AppError = require('../utils/app-error');
const jwtService = require('../services/jwt.service');
const prisma = require('../config/database');

const authenticate = async (req, res, next) => {
  try {

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, null, 'No token provided. Authorization denied.');
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwtService.verifyToken(token);

    if (decoded.sessionId) {
      const session = await prisma.session.findUnique({
        where: { id: decoded.sessionId },
      });

      if (!session) {
        throw new AppError(401, null, 'Session has expired or been logged out. Please log in again.');
      }

      // Update session activity asynchronously
      prisma.session.update({
        where: { id: decoded.sessionId },
        data: { lastActive: new Date() },
      }).catch((e) => console.error('Error updating session lastActive:', e));
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error instanceof AppError) {
      return next(error);
    }
    next(new AppError(401, null, 'Invalid token. Authorization denied.'));
  }
};

module.exports = { authenticate };
