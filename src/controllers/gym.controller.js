const asyncHandler = require('../utils/async-handler');
const ApiResponse = require('../utils/api-response');
const prisma = require('../config/database');


const getAllGyms = asyncHandler(async (req, res, next) => {
  const getAllGyms = await prisma.gym.findMany();
  res.status(200).json(new ApiResponse(200, getAllGyms, 'Gyms retrieved successfully'));
});


const getGym = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json(new ApiResponse(400, null, 'Gym ID is required'));
  }
  const getGym = await prisma.gym.findUnique({ where: { id } });
  if (!getGym) {
    return res.status(404).json(new ApiResponse(404, null, 'Gym not found'));
  }
  res.status(200).json(new ApiResponse(200, getGym, 'Gym retrieved successfully'));
});


const updateGym = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { gymName, ownerName, gymAbout, establishedYear, email, phone, whatsappNumber, alternatePhone, website, addressLine1, addressLine2, city, district, state, country, postalCode, latitude, longitude, workingHours, is24Hours, logoUrl, coverImageUrl, currency, timezone, maxMembers, instagramUrl, facebookUrl, youtubeUrl, gstNumber, licenseNumber, password } = req.body;
  if (!id) {
    return res.status(400).json(new ApiResponse(400, null, 'Gym ID is required'));
  }
  const updateGym = await prisma.gym.update({ where: { id }, data: { gymName, ownerName, gymAbout, establishedYear, email, phone, whatsappNumber, alternatePhone, website, addressLine1, addressLine2, city, district, state, country, postalCode, latitude, longitude, workingHours, is24Hours, logoUrl, coverImageUrl, currency, timezone, maxMembers, instagramUrl, facebookUrl, youtubeUrl, gstNumber, licenseNumber, password } });
  res.status(200).json(new ApiResponse(200, updateGym, 'Gym updated successfully'));
});


const deleteGym = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json(new ApiResponse(400, null, 'Gym ID is required'));
  }
  const deleteGym = await prisma.gym.delete({ where: { id } });
  res.status(200).json(new ApiResponse(200, deleteGym, 'Gym deleted successfully'));
});

module.exports = {
  getAllGyms,
  getGym,
  updateGym,
  deleteGym
};
