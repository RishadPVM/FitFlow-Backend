const asyncHandler = require('../utils/async-handler');
const ApiResponse = require('../utils/api-response');

// @desc    Get all users
// @route   GET /api/v1/users
// @access  Private
const getUsers = asyncHandler(async (req, res, next) => {
  res.status(200).json(new ApiResponse(200, [], 'Users retrieved successfully'));
});

// @desc    Get single user
// @route   GET /api/v1/users/:id
// @access  Private
const getUser = asyncHandler(async (req, res, next) => {
  res.status(200).json(new ApiResponse(200, {}, 'User retrieved successfully'));
});

// @desc    Create new user
// @route   POST /api/v1/users
// @access  Private
const createUser = asyncHandler(async (req, res, next) => {
  res.status(201).json(new ApiResponse(201, {}, 'User created successfully'));
});

// @desc    Update user
// @route   PUT /api/v1/users/:id
// @access  Private
const updateUser = asyncHandler(async (req, res, next) => {
  res.status(200).json(new ApiResponse(200, {}, 'User updated successfully'));
});

// @desc    Delete user
// @route   DELETE /api/v1/users/:id
// @access  Private
const deleteUser = asyncHandler(async (req, res, next) => {
  res.status(200).json(new ApiResponse(200, null, 'User deleted successfully'));
});

module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser
};
