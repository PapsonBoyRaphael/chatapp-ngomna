const mongoose = require("mongoose");
require("dotenv").config();

const ContactModel = require("../models/contact");

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connecté à contact_db (Contacts)"))
  .catch((err) => console.error("Erreur MongoDB (Contact):", err));

module.exports = {
  mongoose,
  Contact: ContactModel,
};
