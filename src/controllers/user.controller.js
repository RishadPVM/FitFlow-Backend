const asyncHandler = require('../utils/async-handler');
const ApiResponse = require('../utils/api-response');
const prisma = require('../config/database');


const getUsers = asyncHandler(async (req, res, next) => {
   const getAllUsers = await prisma.user.findMany();
  res.status(200).json(new ApiResponse(200, getAllUsers, 'Users retrieved successfully'));
});


const getUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json(new ApiResponse(400, null, 'User ID is required'));
  }
  const getUser = await prisma.user.findUnique({ where: { id } });
  if (!getUser) {
    return res.status(404).json(new ApiResponse(404, null, 'User not found'));
  }
  res.status(200).json(new ApiResponse(200, getUser, 'User retrieved successfully'));
});


const updateUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { name, email, phone, role } = req.body;
  if (!id) {
    return res.status(400).json(new ApiResponse(400, null, 'User ID is required'));
  }
  const updateUser = await prisma.user.update({ where: { id }, data: { name, email, phone, role } });
  res.status(200).json(new ApiResponse(200, updateUser, 'User updated successfully'));
});


const deleteUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json(new ApiResponse(400, null, 'User ID is required'));
  }
  const deleteUser = await prisma.user.delete({ where: { id } });
  res.status(200).json(new ApiResponse(200, deleteUser, 'User deleted successfully'));
});

module.exports = {
  getUsers,
  getUser,
  updateUser,
  deleteUser
};
