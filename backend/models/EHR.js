const mongoose = require('mongoose');

const EHRSchema = new mongoose.Schema({
  id: String,
  ownerId: String,
  filename: String,
  file: String,
  iv: String,
  tag: String,
  wrappedToOwner: Object,
  accessRequests: [
    {
      id: String,
      doctorId: String,
      status: String,
      createdAt: Number
    }
  ],
  createdAt: Number
});

module.exports = mongoose.model("EHR", EHRSchema);
