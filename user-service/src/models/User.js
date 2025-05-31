const { DataTypes } = require("sequelize");
const { sequelize } = require("../infrastructure/database/connection");

const Personnel = sequelize.define(
  "Personnel",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    agt_id: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    matricule: {
      type: DataTypes.STRING(50),
      allowNull: true,
      unique: true,
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
      type: DataTypes.STRING(10),
      allowNull: true,
    },
    mmnaissance: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 12,
      },
    },
    aanaissance: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1900,
        max: new Date().getFullYear(),
      },
    },
    lieunaissance: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },
    ministere: {
      type: DataTypes.STRING(300),
      allowNull: true,
    },
  },
  {
    tableName: "personnel", // Force le nom de la table en minuscules
    timestamps: true,
    createdAt: "created_at",
    updatedAt: false, // Désactive la colonne updated_at
  }
);

module.exports = Personnel;
