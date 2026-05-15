const prisma = require("../../config/database");
const asyncHandler = require("../../utils/async-handler");
const ApiResponse = require("../../utils/api-response");
const ApiError = require("../../utils/app-error");
const bcrypt = require("bcrypt");



/**
 * Generate unique gym code
 * Example: GYM-AB12CD
 */
const generateGymCode = async () => {
  let gymCode;
  let exists = true;

  while (exists) {
    gymCode =
      "GYM-" +
      Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

    const existingGym = await prisma.gym.findUnique({
      where: { gymCode },
      select: { id: true },
    });

    exists = !!existingGym;
  }

  return gymCode;
};

/**
 * Create Gym
 */
const createGym = asyncHandler(async (req, res) => {
  const {
    gymName,
    ownerName,
    gymAbout,
    establishedYear,

    email,
    phone,
    whatsappNumber,
    alternatePhone,
    website,

    addressLine1,
    addressLine2,
    city,
    district,
    state,
    country,
    postalCode,
    latitude,
    longitude,

    workingHours,
    is24Hours,

    logoUrl,
    coverImageUrl,

    currency,
    timezone,
    maxMembers,

    instagramUrl,
    facebookUrl,
    youtubeUrl,

    gstNumber,
    licenseNumber,

    password,
  } = req.body;

  // =====================================================
  // REQUIRED FIELD VALIDATION
  // =====================================================
  const requiredFields = {
    gymName,
    ownerName,
    email,
    phone,
    addressLine1,
    city,
    state,
    postalCode,
    password,
  };

  for (const [field, value] of Object.entries(requiredFields)) {
    if (
      value === undefined ||
      value === null ||
      String(value).trim() === ""
    ) {
      throw new ApiError(400, `${field} is required`);
    }
  }

  // =====================================================
  // EMAIL FORMAT VALIDATION
  // =====================================================
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new ApiError(400, "Invalid email address");
  }

  // =====================================================
  // ESTABLISHED YEAR VALIDATION
  // =====================================================
  if (establishedYear) {
    const currentYear = new Date().getFullYear();

    if (
      Number(establishedYear) < 1900 ||
      Number(establishedYear) > currentYear
    ) {
      throw new ApiError(400, "Invalid established year");
    }
  }

  // =====================================================
  // MAX MEMBERS VALIDATION
  // =====================================================
  if (
    maxMembers !== undefined &&
    maxMembers !== null &&
    Number(maxMembers) < 1
  ) {
    throw new ApiError(400, "maxMembers must be greater than 0");
  }

  // =====================================================
  // DUPLICATE CHECKS
  // =====================================================
  const existingGym = await prisma.gym.findFirst({
    where: {
      OR: [
        { email: email.toLowerCase().trim() },
        { phone: phone.trim() },
      ],
    },
    select: {
      id: true,
      email: true,
      phone: true,
    },
  });

  if (existingGym) {
    if (existingGym.email === email.toLowerCase().trim()) {
      throw new ApiError(409, "Email already registered");
    }

    if (existingGym.phone === phone.trim()) {
      throw new ApiError(409, "Phone number already registered");
    }
  }

  // =====================================================
  // GENERATE UNIQUE GYM CODE
  // =====================================================
  const gymCode = await generateGymCode();
  const hashedPassword = await bcrypt.hash(password, 12);

  // =====================================================
  // CREATE GYM
  // =====================================================
  const gym = await prisma.gym.create({
    data: {
      gymCode,

      gymName: gymName.trim(),
      ownerName: ownerName.trim(),
      gymAbout: gymAbout?.trim() || null,
      establishedYear:
        establishedYear !== undefined && establishedYear !== null
          ? Number(establishedYear)
          : null,

      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      whatsappNumber: whatsappNumber?.trim() || null,
      alternatePhone: alternatePhone?.trim() || null,
      website: website?.trim() || null,

      addressLine1: addressLine1.trim(),
      addressLine2: addressLine2?.trim() || null,
      city: city.trim(),
      district: district?.trim() || null,
      state: state.trim(),
      country: country?.trim() || "India",
      postalCode: postalCode.trim(),

      latitude: latitude ?? null,
      longitude: longitude ?? null,

      workingHours: workingHours || null,
      is24Hours: Boolean(is24Hours),

      logoUrl: logoUrl || null,
      coverImageUrl: coverImageUrl || null,

      currency: currency || "INR",
      timezone: timezone || "Asia/Kolkata",
      maxMembers:
        maxMembers !== undefined && maxMembers !== null
          ? Number(maxMembers)
          : null,

      instagramUrl: instagramUrl || null,
      facebookUrl: facebookUrl || null,
      youtubeUrl: youtubeUrl || null,

      gstNumber: gstNumber?.trim() || null,
      licenseNumber: licenseNumber?.trim() || null,

      // Default statuses
      status: "PENDING",
      isActive: false,
      isVerified: false,
      isFeatured: false,

      password: hashedPassword,
    },
  });

  // =====================================================
  // RESPONSE
  // =====================================================
  return res.status(201).json(
    new ApiResponse(
      201,
      gym,
      "Gym registration submitted successfully. Your account is pending approval."
    )
  );
});

module.exports = {
  createGym,
};