require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtAcessSecret: process.env.JWT_ACCESS_SECRET || 'super-secret-key',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'super-refresh-secret-key',
  jwtAcessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '1d',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  // googleClientId: process.env.GOOGLE_CLIENT_ID || '',
};
