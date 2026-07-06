const jwt = require("jsonwebtoken");
const env = require("../config/env");

const generateAcessToken = (user, sessionId = null) => {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role || 'USER',
      sessionId: sessionId,
    },
    env.jwtAcessSecret,
    { 
      expiresIn: env.jwtAcessExpiresIn
    },
  );
};

const generateRefreshToken = (user, sessionId = null) => {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role || 'USER',
      sessionId: sessionId,
    },
    env.jwtRefreshSecret,
    {
      expiresIn: env.jwtRefreshExpiresIn,
    },
  );
};

const verifyAcessToken = (token) => {
  return jwt.verify(token, env.jwtAcessSecret);
};

const verifyToken = verifyAcessToken;

module.exports = { generateAcessToken, generateRefreshToken, verifyAcessToken, verifyToken };
