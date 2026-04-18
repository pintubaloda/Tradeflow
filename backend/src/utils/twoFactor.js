const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

const KEY_ENV = 'TWOFA_ENCRYPTION_KEY';

const deriveKey = () => {
  const raw = (process.env[KEY_ENV] || '').trim();
  if (!raw) return null;
  // Accept any string and derive a stable 32-byte key.
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
};

const encryptV1 = (plain) => {
  const key = deriveKey();
  if (!key) throw new Error(`${KEY_ENV} is not set`);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${ciphertext.toString('base64')}:${tag.toString('base64')}`;
};

const decryptV1 = (enc) => {
  const key = deriveKey();
  if (!key) throw new Error(`${KEY_ENV} is not set`);
  const parts = String(enc || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Invalid encrypted payload');
  const iv = Buffer.from(parts[1], 'base64');
  const ciphertext = Buffer.from(parts[2], 'base64');
  const tag = Buffer.from(parts[3], 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
};

const generateSecret = ({ email, issuer = 'TradeFlow' }) => {
  const s = speakeasy.generateSecret({
    length: 20,
    name: `${issuer}:${email}`,
    issuer,
  });
  return { base32: s.base32, otpauthUrl: s.otpauth_url };
};

const generateQrDataUrl = async (otpauthUrl) => {
  return QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220 });
};

const verifyTotp = ({ secretBase32, token, window = 1 }) => {
  return speakeasy.totp.verify({
    secret: secretBase32,
    encoding: 'base32',
    token: String(token || '').replace(/\s+/g, ''),
    window,
  });
};

const generateBackupCodes = (count = 10) => {
  const codes = [];
  for (let i = 0; i < count; i++) {
    // 10 digits, grouped for readability
    const raw = crypto.randomBytes(6).toString('hex').slice(0, 10);
    codes.push(raw.toUpperCase());
  }
  return codes;
};

const hashBackupCode = (code) => crypto.createHash('sha256').update(String(code || '').toUpperCase()).digest('hex');

module.exports = {
  encryptV1,
  decryptV1,
  generateSecret,
  generateQrDataUrl,
  verifyTotp,
  generateBackupCodes,
  hashBackupCode,
};

