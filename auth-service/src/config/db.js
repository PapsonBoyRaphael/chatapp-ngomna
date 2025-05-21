const mongoose = require("mongoose");
require("dotenv").config();

const OtpSessionModel = require("../models/otpSession");

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connecté à auth_db (OtpSession)"))
  .catch((err) => console.error("Erreur MongoDB (Auth):", err));

module.exports = {
  mongoose,
  OtpSession: OtpSessionModel,
};
