const Counter = require('../models/Counter');

async function getNextCounter(name, startValue = 1000) {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { value: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  // If it's a new counter, set the starting value
  if (counter.value === 1) {
    counter.value = startValue;
    await counter.save();
  }

  return counter.value;
}

module.exports = getNextCounter;
