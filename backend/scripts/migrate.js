const fs = require('fs');
const mongoose = require('mongoose');
require('dotenv').config();

const User = require("../models/User");
const EHR = require("../models/EHR");
const Wrappack = require("../models/Wrappack");
const Counter = require("../models/Counter");

async function migrate() {
  await mongoose.connect(process.env.MONGO_URI);

  const store = JSON.parse(fs.readFileSync("storage/store.json"));

  for (const [id, user] of Object.entries(store.users)) {
    await new User(user).save();
  }
  for (const [id, ehr] of Object.entries(store.ehrs)) {
    await new EHR(ehr).save();
  }
  for (const [id, pack] of Object.entries(store.wrappacks)) {
    await new Wrappack(pack).save();
  }
  for (const [key, value] of Object.entries(store.counters)) {
    await new Counter({ name: key, value }).save();
  }

  console.log("Migration completed.");
  process.exit();
}

migrate();
