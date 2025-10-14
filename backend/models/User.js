const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  role: { type: String, required: true },
  fullName: { type: String, required: true },
  dob: String,
  gender: String,
  contact: String,
  email: { type: String, required: true, unique: true },
  address: String,
  licenseId: String,
  specialization: String,
  hospital: String,
  passwordHash: { type: String, required: true },
  pub: String,
  priv: String,
  suspended: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model("User", UserSchema);
