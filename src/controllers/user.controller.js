const asyncHandler = require('../utils/async-handler');
const ApiResponse = require('../utils/api-response');
const AppError = require("../utils/app-error");
const prisma = require('../config/database');


const getUsers = asyncHandler(async (req, res, next) => {
  try{
    const getAllUsers = await prisma.user.findMany();
    res.status(200).json(new ApiResponse(200, getAllUsers, 'Users retrieved successfully'));
  } catch (error) {
    return next(error);
  }
});


const getUser = asyncHandler(async (req, res, next) => {
  try {
     const { id } = req.params;
  if (!id) {
    throw new AppError(400, null, 'User ID is required');
  }
  const getUser = await prisma.user.findUnique({ where: { id } });
  if (!getUser) {
    throw new AppError(404, null, 'User not found');
  }
  res.status(200).json(new ApiResponse(200, getUser, 'User retrieved successfully'));
  } catch (error) {
    return next(error);
  }
});


const updateUser = asyncHandler(async (req, res, next) => {
  try{
  const { id } = req.params;
  const { name, email, phone, role } = req.body;
  if (!id) {
    throw new AppError(400, null, 'User ID is required');
  }
  const updateUser = await prisma.user.update({ where: { id }, data: { name, email, phone, role } });
  res.status(200).json(new ApiResponse(200, updateUser, 'User updated successfully'));
  } catch (error) {
    return next(error);
  }
});


const deleteUser = asyncHandler(async (req, res, next) => {
  try {
     const { id } = req.params;
  if (!id) {
    throw new AppError(400, null, 'User ID is required');
  }
  const deleteUser = await prisma.user.delete({ where: { id } });
  res.status(200).json(new ApiResponse(200, deleteUser, 'User deleted successfully'));
  } catch (error) {
    return next(error);
  }
});

module.exports = {
  getUsers,
  getUser,
  updateUser,
  deleteUser
};
