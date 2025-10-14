const mongoose = require('mongoose');

const CounterSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  value: { type: Number, default: 1000 }
}, { timestamps: true });

module.exports = mongoose.model("Counter", CounterSchema);
