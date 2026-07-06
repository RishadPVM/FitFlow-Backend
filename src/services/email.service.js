const nodemailer = require("nodemailer");
const env = require("../config/env");

// Create transport
const transporter = nodemailer.createTransport({
  host: env.smtpHost,
  port: env.smtpPort,
  secure: true,
  auth: {
    user: env.smtpUser,
    pass: env.smtpPass,
  },
});



const sendOtpEmail = async (toEmail, otp, type = 'forgot-password') => {
  const isSignup = type === 'signup';
  const isEmailChange = type === 'email-change';

  let subject = "Reset Your Gym Admin Password";
  if (isSignup) {
    subject = "Verify Your Gym Admin Email Address";
  } else if (isEmailChange) {
    subject = "Verify Your Email Change Request";
  }

  if (!env.smtpUser || !env.smtpPass) {
    console.log(`========================================`);
    console.log(`[DEV EMAIL SIMULATION]`);
    console.log(`To: ${toEmail}`);
    console.log(`Subject: ${subject}`);
    console.log(`Verification Code: ${otp}`);
    console.log(`========================================`);
    return { simulated: true, otp };
  }

  const mailOptions = {
    from: `"FitFlow Admin" <${env.smtpFrom}>`,
    to: toEmail,
    subject: subject,
    text: isSignup 
      ? `Welcome to FitFlow! Your verification code is: ${otp}\n\nThis code will expire in 5 minutes.\n\nIf you did not initiate this sign-up request, please ignore this email.`
      : isEmailChange
        ? `Your verification code to change your email address is: ${otp}\n\nThis code will expire in 5 minutes.\n\nIf you did not request this email change, please ignore this email.`
        : `Your verification code is: ${otp}\n\nThis code will expire in 5 minutes.\n\nIf you did not request this password reset, please ignore this email.`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${subject}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #0E0E11;
            color: #FFFFFF;
            margin: 0;
            padding: 0;
          }
          .email-wrapper {
            background-color: #0E0E11;
            padding: 32px 16px;
          }
          .card {
            background-color: #18181B;
            border: 1px solid #27272A;
            border-radius: 16px;
            max-width: 500px;
            margin: 0 auto;
            padding: 32px;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
          }
          .logo {
            font-size: 24px;
            font-weight: 800;
            color: #A3C0FF;
            text-align: center;
            margin-bottom: 24px;
            letter-spacing: -0.5px;
          }
          .title {
            font-size: 20px;
            font-weight: 700;
            color: #FFFFFF;
            margin-bottom: 12px;
            text-align: center;
          }
          .subtitle {
            font-size: 14px;
            color: #F4F4F5;
            margin-bottom: 24px;
            text-align: center;
            line-height: 1.5;
          }
          .otp-container {
            background-color: #0E0E11;
            border: 1px dashed #A3C0FF;
            border-radius: 12px;
            padding: 16px;
            text-align: center;
            margin-bottom: 24px;
          }
          .otp-code {
            font-family: 'Courier New', Courier, monospace;
            font-size: 36px;
            font-weight: 800;
            color: #39FF14;
            letter-spacing: 6px;
            margin: 0;
          }
          .expiry-text {
            font-size: 12px;
            color: #FF5252;
            text-align: center;
            margin-bottom: 24px;
          }
          .divider {
            height: 1px;
            background-color: #27272A;
            margin: 24px 0;
          }
          .footer {
            font-size: 12px;
            color: #F4F4F5;
            text-align: center;
            line-height: 1.5;
          }
        </style>
      </head>
      <body>
        <div class="email-wrapper">
          <div class="card">
            <div class="logo">FitFlow</div>
            <h1 class="title">${isSignup ? "Verify Your Gym Admin Email Address" : isEmailChange ? "Verify Your Email Change Request" : "Reset Your Gym Admin Password"}</h1>
            <p class="subtitle">
              ${isSignup 
                ? "Welcome to FitFlow! Your email verification code is listed below. Use this code to verify your email address and complete your Gym account registration." 
                : isEmailChange
                  ? "Your verification code to change your email address is listed below. Use this code to verify and complete your email change request."
                  : "Your verification code is listed below. Use this code to complete your password reset request."}
            </p>
            
            <div class="otp-container">
              <div class="otp-code">${otp}</div>
            </div>
            
            <p class="expiry-text">This code will expire in 5 minutes.</p>
            
            <div class="divider"></div>
            
            <p class="footer">
              ${isSignup 
                ? "If you did not initiate this sign-up request, please ignore this email. No account will be created without this verification." 
                : isEmailChange
                  ? "If you did not initiate this email change request, please ignore this email. Your email address will remain unchanged."
                  : "If you did not request this password reset, please ignore this email. Your password will remain unchanged."}
            </p>
          </div>
        </div>
      </body>
      </html>
    `,
  };

  return transporter.sendMail(mailOptions);
};

module.exports = {
  sendOtpEmail,
};
