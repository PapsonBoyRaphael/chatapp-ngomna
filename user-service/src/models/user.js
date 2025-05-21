const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const User = sequelize.define(
  "User",
  {
    username: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      trim: true,
      validate: {
        len: [3, 50],
      },
    },
    bio: {
      type: DataTypes.STRING,
      defaultValue: "",
      trim: true,
      validate: {
        len: [0, 500],
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      trim: true,
      validate: {
        len: [6, 255],
      },
    },
    email: {
      type: DataTypes.STRING,
      defaultValue: "",
      trim: true,
      validate: {
        isEmail: true,
      },
    },
    phoneNumber: {
      type: DataTypes.STRING,
      defaultValue: "",
      trim: true,
      validate: {
        is: [/^\+?[1-9]\d{1,14}$/, "Please enter a valid phone number"],
      },
    },
    role: {
      type: DataTypes.STRING,
      allowNull: false,
      trim: true,
      validate: {
        isIn: [["user", "admin"]],
      },
    },
    status: {
      type: DataTypes.STRING,
      defaultValue: "",
      trim: true,
    },
    profilePicture: {
      type: DataTypes.JSONB, // Utilisation de JSONB pour PostgreSQL
      defaultValue: {
        public_id: "",
        url: "",
        width: 0,
        height: 0,
        format: "",
      },
    },
    isverify: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    mongoId: {
      type: DataTypes.STRING,
      defaultValue: "",
      unique: true,
    },
  },
  {
    timestamps: true,
    tableName: "users",
  }
);

module.exports = User;
