const crypto = require('crypto');
const EC = require('elliptic').ec;
const ec = new EC('p256');

function genECKeypair() {
  const key = ec.genKeyPair();
  const pub = key.getPublic('hex');
  const priv = key.getPrivate('hex');
  return { pub, priv };
}

function aesEncryptBuffer(buffer) {
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: ct.toString('hex'), iv: iv.toString('hex'), tag: tag.toString('hex'), symKey: key.toString('hex') };
}

function aesDecryptBuffer(ciphertextHex, ivHex, tagHex, symKeyHex) {
  const key = Buffer.from(symKeyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const ct = Buffer.from(ciphertextHex, 'hex');
  const out = Buffer.concat([decipher.update(ct), decipher.final()]);
  return out;
}

function deriveKek(sharedBN) {
  const sharedBuf = Buffer.from(sharedBN.toArray('be', 32));
  // Always derive exactly 32 bytes
  return crypto.hkdfSync(
    'sha256',
    sharedBuf,
    Buffer.alloc(0),         // salt
    Buffer.from('ehr-kek'),  // info
    32
  ); // returns Buffer of length 32
}

function wrapKeyToPub(symKeyHex, recipientPubHex) {
  const recipientPub = ec.keyFromPublic(recipientPubHex, 'hex').getPublic();
  const eph = ec.genKeyPair();
  const shared = eph.derive(recipientPub);
  const kek = deriveKek(shared); // already a 32-byte Buffer
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
  const ct = Buffer.concat([cipher.update(Buffer.from(symKeyHex, 'hex')), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ephPub: eph.getPublic('hex'),
    wrapped: ct.toString('hex'),
    iv: iv.toString('hex'),
    tag: tag.toString('hex')
  };
}

function unwrapKeyFromEph(wrappedHex, ephPubHex, recipientPrivHex, ivHex, tagHex) {
  const ephPub = ec.keyFromPublic(ephPubHex, 'hex').getPublic();
  const recipientKey = ec.keyFromPrivate(recipientPrivHex, 'hex');
  const shared = recipientKey.derive(ephPub);
  const kek = deriveKek(shared); // already Buffer
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv);
  decipher.setAuthTag(tag);
  const wrapped = Buffer.from(wrappedHex, 'hex');
  const out = Buffer.concat([decipher.update(wrapped), decipher.final()]);
  return out.toString('hex');
}


module.exports = {
  genECKeypair,
  aesEncryptBuffer,
  aesDecryptBuffer,
  wrapKeyToPub,
  unwrapKeyFromEph
};
