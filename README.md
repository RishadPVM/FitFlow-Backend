# FitFlow Backend

Production-ready backend for FitFlow, a Gym Management SaaS application.

## Tech Stack
- Node.js & Express.js
- Prisma ORM
- PostgreSQL
- JSON Web Tokens (JWT) for authentication

## Setup

1. Install dependencies:
   `bash
   npm install
   `

2. Configure environment variables:
   Copy `.env.example` to `.env` and update the values.

3. Setup Database:
   `bash
   npm run prisma:migrate
   npm run prisma:generate
   `

4. Run the server:
   `bash
   # Development mode
   npm run dev

   # Production mode
   npm start
   `
