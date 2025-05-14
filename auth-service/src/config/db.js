const mongoose = require("mongoose");
require("dotenv").config();

const UserModel = require("../models/user");

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connecté à auth_db (Users)"))
  .catch((err) => console.error("Erreur MongoDB (Auth):", err));

module.exports = { mongoose, User: UserModel };
