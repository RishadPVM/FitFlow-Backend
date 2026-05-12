const jwt = require("jsonwebtoken");
const env = require("../config/env");

const generateAcessToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
    },
    env.jwtAcessSecret,
    { 
      expiresIn: env.jwtAcessExpiresIn
    },
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      role: user.role,
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

module.exports = { generateAcessToken, generateRefreshToken, verifyAcessToken };
