const mongoose = require("mongoose");

const contactSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "User ID is required"],
      ref: "User",
      index: true,
    },
    contact: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "Contact ID is required"],
      ref: "User",
      index: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

contactSchema.pre("save", function (next) {
  if (this.user.equals(this.contact)) {
    next(new Error("User and contact cannot be the same"));
  }
  next();
});

contactSchema.index({ user: 1, contact: 1 }, { unique: true });

module.exports = mongoose.model("Contact", contactSchema);
