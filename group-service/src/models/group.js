const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Group name is required"],
      unique: true,
      trim: true,
      minlength: [3, "Group name must be at least 3 characters"],
      maxlength: [50, "Group name cannot exceed 50 characters"],
      index: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"],
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        required: [true, "At least one member is required"],
        ref: "User",
      },
    ],
    admins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        required: [true, "At least one admin is required"],
        ref: "User",
      },
    ],
    messages: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Message",
      },
    ],
    profile_pic: {
      public_id: {
        type: String,
        default: "",
      },
      url: {
        type: String,
        default: "",
      },
      width: {
        type: Number,
        default: 0,
        min: [0, "Width cannot be negative"],
      },
      height: {
        type: Number,
        default: 0,
        min: [0, "Height cannot be negative"],
      },
      format: {
        type: String,
        default: "",
        enum: ["jpg", "jpeg", "png", "", "webp"],
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

groupSchema.pre("save", function (next) {
  if (this.members.length === 0) {
    next(new Error("Group must have at least one member"));
  }
  if (this.admins.length === 0) {
    next(new Error("Group must have at least one admin"));
  }
  this.admins.forEach((admin) => {
    if (!this.members.some((member) => member.equals(admin))) {
      next(new Error("All admins must be members of the group"));
    }
  });
  next();
});

module.exports = mongoose.model("Group", groupSchema);
