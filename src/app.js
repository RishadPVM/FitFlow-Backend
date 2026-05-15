const express = require("express");
const cors = require("cors");
const env = require("./config/env");

const errorHandler = require("./middleware/error.middleware");
const notFoundHandler = require("./middleware/not-found.middleware");
const rateLimiter = require("./middleware/rate-limit.middleware");

// routes
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const gymRoutes = require("./routes/gym.routes");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(rateLimiter);

// Routes
// app.use('/api/v1', routes);

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/gyms", gymRoutes);

// 404 Handler
app.use(notFoundHandler);

// Global Error Handler
app.use(errorHandler);

module.exports = app;
