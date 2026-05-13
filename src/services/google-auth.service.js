const { OAuth2Client } = require('google-auth-library');
const env = require("../config/env");

const client = new OAuth2Client(env.googleClientId);

const verifyGoogleToken = async (idToken) => {
  const ticket = await client.verifyIdToken({
    idToken,
    audience: env.googleClientId,
  });
  return ticket.getPayload();
};

module.exports = {
  verifyGoogleToken,
};