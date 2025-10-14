const connectDB = require('./db');
connectDB();
require('dotenv').config();
const mongoose = require('mongoose');

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const ethers = require('ethers');
const User = require('./models/User');
const EHR = require('./models/EHR');
const WrapPack = require('./models/Wrappack');
const Counter = require('./models/Counter');
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB connected"))
.catch(err => console.error("❌ MongoDB connection error:", err));


const { genECKeypair, aesEncryptBuffer, aesDecryptBuffer, wrapKeyToPub, unwrapKeyFromEph } = require('./crypto-utils');

let contractAddress = null;
try {
  const raw = fs.readFileSync(path.join(__dirname, 'contractAddress.json'));
  contractAddress = JSON.parse(raw).address;
} catch(e){ /* no contract */ }

let provider = null;
let signer = null;
let contract = null;
if(contractAddress){
  provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
  signer = provider.getSigner(0);
  try{
    const abiPath = path.join(__dirname, '..', 'artifacts', 'contracts', 'EHRRegistry.sol', 'EHRRegistry.json');
    const abi = JSON.parse(fs.readFileSync(abiPath)).abi;
    contract = new ethers.Contract(contractAddress, abi, signer);
    console.log('Blockchain contract loaded at', contractAddress);
  }catch(e){ console.error('Could not load contract ABI - compile + deploy first'); }
} else {
  console.log('No contract address found. Blockchain calls will be skipped until deployment.');
}

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '..', 'frontend')));
const upload = multer({ storage: multer.memoryStorage() });
const getNextCounter = require('./utils/counter');


app.post('/api/register/patient', async (req, res) => {
  try {
    const { fullName, dob, gender, contact, email, address, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ err: 'email and password are required' });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ err: 'Email already exists' });
    }

    // Get next patient counter
    const nextId = await getNextCounter('patient', 1000);
    const patientId = 'P' + nextId;

    // Generate encryption keys
    const { pub, priv } = genECKeypair();

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new User({
      id: patientId,
      role: 'patient',
      fullName,
      dob,
      gender,
      contact,
      email,
      address,
      passwordHash: hashed,
      pub,
      priv,
      suspended: false
    });

    await newUser.save();

    // Blockchain contract call if available
    if (contract) {
      try {
        await contract.registerUser(patientId, 'patient', email);
      } catch (e) {
        console.error('Contract call failed:', e.message);
      }
    }

    res.json({
      ok: true,
      message: "User registered successfully",
      patientId,
      privateKey: priv
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Internal server error' });
  }
});


app.post('/api/register/doctor', async (req, res) => {
  try {
    const { fullName, contact, email, licenseId, specialization, hospital, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ err: 'email and password are required' });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ err: 'Email already exists' });
    }

    // Get next doctor counter
    const nextId = await getNextCounter('doctor', 2000);
    const doctorId = 'D' + nextId;

    // Generate encryption keys
    const { pub, priv } = genECKeypair();

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Create new doctor user
    const newUser = new User({
      id: doctorId,
      role: 'doctor',
      fullName,
      contact,
      email,
      licenseId,
      specialization,
      hospital,
      passwordHash: hashed,
      pub,
      priv,
      suspended: false
    });

    await newUser.save();

    // Blockchain contract call if available
    if (contract) {
      try {
        await contract.registerUser(doctorId, 'doctor', email);
      } catch (e) {
        console.error('Contract call failed:', e.message);
      }
    }

    res.json({
      ok: true,
      message: "User registered successfully",
      doctorId,
      privateKey: priv
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Internal server error' });
  }
});



app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, message: "email and password are required" });
    }

    // Find user in MongoDB
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ ok: false, message: "invalid email id" });
    }

    // Compare password hash
    const ok = await bcrypt.compare(password, user.passwordHash);

    if (!ok) {
      return res.status(401).json({ ok: false, message: "incorrect password" });
    }

    // Login successful
    return res.json({
      ok: true,
      message: "User logged in successfully",
      id: user.id,
      role: user.role
    });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, message: "internal server error" });
  }
});

app.post('/api/upload-ehr', upload.single('ehrFile'), async (req, res) => {
  try {
    const { ownerId, filename } = req.body;

    if (!ownerId || !req.file) {
      return res.status(400).json({ ok: false, message: "ownerId and file required" });
    }

    // Find the owner in DB
    const owner = await User.findOne({ id: ownerId });

    if (!owner) {
      return res.status(404).json({ ok: false, message: "owner not found" });
    }

    if (owner.role !== 'patient') {
      return res.status(400).json({ ok: false, message: "only patient can upload" });
    }

    // Encrypt file
    const buf = req.file.buffer;
    const aes = aesEncryptBuffer(buf);
    const wrapped = wrapKeyToPub(aes.symKey, owner.pub);

    // Generate a new EHR ID
    const counterValue = await getNextCounter('ehr', 3000);
    const ehrId = 'EHR' + counterValue;

    // Save metadata and file directly in MongoDB
    const newEHR = new EHR({
      id: ehrId,
      ownerId,
      filename: filename || req.file.originalname,
      file: Buffer.from(aes.ciphertext, 'utf8'), // store encrypted file directly
      iv: aes.iv,
      tag: aes.tag,
      wrappedToOwner: wrapped,
      accessRequests: [],
      createdAt: Date.now()
    });

    await newEHR.save();

    // Optional: smart contract call
    if (contract) {
      try {
        await contract.uploadEHR(ehrId, ownerId, newEHR.filename);
      } catch (e) {
        console.error('contract call failed', e.message);
      }
    }

    return res.json({ ok: true, message: "File successfully uploaded", ehrId });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
});
app.get('/api/pending-requests/:ownerId', async (req, res) => {
  try {
    const ownerId = req.params.ownerId;

    // Find all EHRs for the given ownerId
    const ehrs = await EHR.find({ ownerId });

    const requests = [];

    for (const ehr of ehrs) {
      if (ehr.accessRequests && ehr.accessRequests.length > 0) {
        for (const r of ehr.accessRequests) {
          if (r.status === "pending") {
            // Find doctor details
            const doctor = await User.findOne({ id: r.doctorId });

            requests.push({
              doctorId: r.doctorId,
              doctorName: doctor ? doctor.fullName : "Unknown Doctor",
              ehrId: ehr.id,
              requestId: r.id
            });
          }
        }
      }
    }

    if (requests.length === 0) {
      return res.json({ ok: true, message: "No pending requests", requests: [] });
    }

    return res.json({ ok: true, requests });

  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Server error" });
  }
});


app.post('/api/request-access', async (req, res) => {
  try {
    const { doctorId, ehrId } = req.body;

    // Find doctor
    const doc = await User.findOne({ id: doctorId });
    if (!doc) return res.status(404).json({ err: 'doctor not found' });

    // Find EHR
    const ehr = await EHR.findOne({ id: ehrId });
    if (!ehr) return res.status(404).json({ err: 'ehr not found' });

    // Create request
    const reqId = uuidv4();
    ehr.accessRequests.push({
      id: reqId,
      doctorId,
      status: 'pending',
      createdAt: Date.now()
    });

    await ehr.save();

    // Optional: smart contract call
    if (contract) {
      try {
        await contract.requestAccess(reqId, ehrId, doctorId);
      } catch (e) {
        console.error('contract call failed', e.message);
      }
    }

    return res.json({
      ok: true,
      message: "EHR request sent to patient successfully",
      requestId: reqId
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
});


app.post('/api/request-access', async (req, res) => {
  try {
    const { doctorId, ehrId } = req.body;

    // Find doctor
    const doc = await User.findOne({ id: doctorId });
    if (!doc) return res.status(404).json({ err: 'doctor not found' });

    // Find EHR
    const ehr = await EHR.findOne({ id: ehrId });
    if (!ehr) return res.status(404).json({ err: 'ehr not found' });

    // Create request
    const reqId = uuidv4();
    ehr.accessRequests.push({
      id: reqId,
      doctorId,
      status: 'pending',
      createdAt: Date.now()
    });

    await ehr.save();

    // Optional: smart contract call
    if (contract) {
      try {
        await contract.requestAccess(reqId, ehrId, doctorId);
      } catch (e) {
        console.error('contract call failed', e.message);
      }
    }

    return res.json({
      ok: true,
      message: "EHR request sent to patient successfully",
      requestId: reqId
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
});


app.post('/api/approve-request', async (req, res) => {
  try {
    const { requestId, ownerPrivHex } = req.body;

    console.log("[approve-request] requestId:", requestId);

    // 1️⃣ Find the EHR containing this request
    const ehr = await EHR.findOne({ "accessRequests.id": requestId });
    if (!ehr) {
      console.error("EHR not found for requestId:", requestId);
      return res.status(404).json({ err: "ehr not found" });
    }

    console.log("[approve-request] Found EHR:", ehr.id);

    const reqObj = ehr.accessRequests.find(r => r.id === requestId);
    if (!reqObj) {
      console.error("Request object not found for requestId:", requestId);
      return res.status(404).json({ err: "request not found" });
    }

    const ownerId = ehr.ownerId;

    // 2️⃣ Ensure wrappedToOwner fields are correct
    const { wrapped, ephPub, iv, tag } = ehr.wrappedToOwner || {};
    console.log("[approve-request] wrappedToOwner:", { wrapped, ephPub, iv, tag });

    if (!wrapped || !ephPub || !iv || !tag) {
      console.error("Missing wrappedToOwner fields");
      return res.status(400).json({ err: "Invalid wrappedToOwner data" });
    }

    let symKeyHex;
    try {
      symKeyHex = unwrapKeyFromEph(wrapped, ephPub, ownerPrivHex, iv, tag);
      console.log("[approve-request] symKeyHex:", symKeyHex);
    } catch (err) {
      console.error("unwrapKeyFromEph failed:", err);
      return res.status(403).json({ err: "not an authenticated person" });
    }

    // 3️⃣ Find the doctor
    const doctor = await User.findOne({ id: reqObj.doctorId });
    if (!doctor) {
      console.error("Doctor not found:", reqObj.doctorId);
      return res.status(404).json({ err: "doctor not found" });
    }

    console.log("[approve-request] Doctor found:", doctor.id);

    // 4️⃣ Wrap key for doctor
    const rewrap = wrapKeyToPub(symKeyHex, doctor.pub);

    const packId = `${ehr.id}::${reqObj.doctorId}`;
    console.log("[approve-request] packId:", packId);

    // 5️⃣ Create WrapPack
    try {
      await WrapPack.create({
        id: packId,
        rewrap,
        ehrId: ehr.id,
        doctorId: reqObj.doctorId,
        createdAt: Date.now()
      });
      console.log("[approve-request] WrapPack created successfully");
    } catch (err) {
      console.error("WrapPack creation failed:", err);
      return res.status(500).json({ err: "wrappack creation failed" });
    }

    // 6️⃣ Update request status
    await EHR.updateOne(
      { "accessRequests.id": requestId },
      { $set: { "accessRequests.$.status": "approved" } }
    );

    console.log("[approve-request] Access request approved");

    // 7️⃣ Call smart contract if exists
    if (contract) {
      try {
        await contract.approveAccess(requestId, ehr.id, ownerId);
        console.log("[approve-request] Contract approveAccess success");
      } catch (e) {
        console.error("Contract approveAccess failed:", e.message);
      }
    }

    res.json({ ok: true, packId });

  } catch (error) {
    console.error("[approve-request] Internal error:", error);
    res.status(500).json({ ok: false, message: "Internal server error" });
  }
});

app.post("/api/fetch-ehr", async (req, res) => {
  try {
    const { doctorId, doctorPrivHex, ehrId } = req.body;

    const ehr = await EHR.findOne({ id: ehrId });
    if (!ehr) return res.status(404).json({ err: "EHR not found" });

    const pack = await WrapPack.findOne({ ehrId: ehrId, doctorId: doctorId });
    if (!pack) return res.status(403).json({ err: "patient yet to provide access" });

    try {
      const { wrapped: wrappedHex, ephPub, iv: wrapIv, tag: wrapTag } = pack.rewrap;
      const symKeyHex = unwrapKeyFromEph(wrappedHex, ephPub, doctorPrivHex, wrapIv, wrapTag);

      const encHex = ehr.file;
      if (!encHex) return res.status(404).json({ err: "encrypted file missing" });

      const plaintextBuf = aesDecryptBuffer(encHex, ehr.iv, ehr.tag, symKeyHex);

      res.json({
        ok: true,
        filename: ehr.filename,
        data: plaintextBuf.toString("base64"),
      });
    } catch (err) {
      console.error(err);
      return res.status(403).json({ err: "unauthenticated doctor" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, message: "Internal server error" });
  }
});


app.post('/api/approve-request', async (req, res) => {
  try {
    const { ehrId, requestId, doctorId } = req.body;

    const ehr = await EHR.findOne({ id: ehrId });
    if (!ehr) return res.status(404).json({ err: 'EHR not found' });

    // Find the request
    const request = ehr.accessRequests.find(r => r.id === requestId && r.doctorId === doctorId);
    if (!request) return res.status(404).json({ err: 'Request not found' });

    // Approve it
    request.status = "approved";
    await ehr.save();

    // Create the wrapPack for the doctor
    const symKeyHex = retrieveSymKeySomehow(ehr); // your existing encryption key logic
    const ephPub = generateEphPub(); // ephemeral public key logic
    const { wrapped, iv, tag } = wrapKeyToPub(symKeyHex, doctorPubKey); // your existing wrap function

    const packId = ehrId + "::" + doctorId;

    const wrapPack = new WrapPack({
      id: packId,
      rewrap: { wrapped, ephPub, iv, tag }
    });

    await wrapPack.save();

    res.json({ ok: true, message: "Access approved" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: 'Internal server error' });
  }
});

app.get('/api/list-users', async (req, res) => {
  try {
    const users = await User.find({});
    const ehrs = await EHR.find({});

    const userList = users.map(user => {
      const ehrCount = ehrs.filter(ehr => ehr.ownerId === user.id).length;

      if (user.role === "patient") {
        return {
          id: user.id,
          fullName: user.fullName,
          dob: user.dob,
          gender: user.gender,
          contact: user.contact,
          email: user.email,
          address: user.address,
          ehrsUploaded: ehrCount
        };
      } else if (user.role === "doctor") {
        return {
          id: user.id,
          role: user.role,
          fullName: user.fullName,
          contact: user.contact,
          email: user.email,
          licenseId: user.licenseId,
          specialization: user.specialization,
          hospital: user.hospital
        };
      }
    });

    res.json({ ok: true, users: userList });

  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, message: "Internal server error" });
  }
});



app.get('/api/list-ehrs/:ownerId', async (req, res) => {
  const ownerId = req.params.ownerId;

  try {
    const ehrs = await EHR.find({ ownerId }).select('id filename').lean();

    if (ehrs.length === 0) {
      return res.json({ ok: true, message: "No EHRs uploaded yet", ehrs: [] });
    }

    const formattedEHRs = ehrs.map(ehr => ({
      ehrId: ehr.id,
      filename: ehr.filename || null
    }));

    return res.json({ ok: true, ehrs: formattedEHRs });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, message: "Internal server error" });
  }
});

const PORT = 4001 ;
app.listen(PORT, ()=>console.log("Backend listening on", PORT));
