const mongoose = require('mongoose');

const WrappackSchema = new mongoose.Schema({
  rewrap: Object,
  ehrId: String,
  doctorId: String,
  createdAt: Number
});

module.exports = mongoose.model("Wrappack", WrappackSchema);
