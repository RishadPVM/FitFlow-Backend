const express = require("express");
const cors = require("cors");
const env = require("./config/env");

const errorHandler = require("./middleware/error.middleware");
const rateLimiter = require("./middleware/rate-limit.middleware");

// routes
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const gymRoutes = require("./routes/gym.routes");
const membershipPlanRoutes = require("./routes/membership-plan.routes");
const gymOverviewRoutes = require("./routes/gym.overview.routes");
const attendanceRoutes = require("./routes/attendance.roures");

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
app.use("/api/v1/membership-plans", membershipPlanRoutes);
app.use('/api/v1/gym/overview', gymOverviewRoutes)
app.use('/api/v1/attendance', attendanceRoutes)


// Global Error Handler
app.use(errorHandler);

module.exports = app;
