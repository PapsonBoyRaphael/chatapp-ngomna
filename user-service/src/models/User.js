const { DataTypes } = require("sequelize");
const { sequelize } = require("../infrastructure/database/connection");

const User = sequelize.define(
  "User",
  {
    matricule: {
      type: DataTypes.STRING(20),
      primaryKey: true,
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
      },
    },
    nom: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    prenom: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    sexe: {
      type: DataTypes.ENUM("M", "F"),
      allowNull: false,
      validate: {
        isIn: [["M", "F"]],
      },
    },
    rang: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    ministere: {
      type: DataTypes.STRING(150),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
  },
  {
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
  }
);

module.exports = User;
