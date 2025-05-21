const mongoose = require("mongoose");
require("dotenv").config();

const GroupModel = require("../models/group");

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("Connecté à group_db (Groups)"))
  .catch((err) => console.error("Erreur MongoDB (Group):", err));

module.exports = {
  mongoose,
  Group: GroupModel,
};
