const mongoose = require("mongoose");

const otpSessionSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: [true, "Phone number is required"],
    trim: true,
    match: [/^\+?[1-9]\d{1,14}$/, "Please enter a valid phone number"], // Validation E.164 simplifiée
  },
  otpCode: {
    type: String,
    required: [true, "OTP code is required"],
    trim: true,
    minlength: [4, "OTP code must be at least 4 characters"],
    maxlength: [6, "OTP code cannot exceed 6 characters"],
  },
  expiresAt: {
    type: Date,
    required: [true, "Expiration date is required"],
    index: { expires: 0 }, // Index TTL pour supprimer automatiquement après expiration
  },
  verified: {
    type: Boolean,
    default: false,
  },
});

// Index sur phoneNumber pour optimiser les recherches
otpSessionSchema.index({ phoneNumber: 1 });

module.exports = mongoose.model("OtpSession", otpSessionSchema);
