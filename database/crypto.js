// Field encryption for the database (AES-256-GCM). Values are JSON-encoded, then sealed as "v1:" + base64(iv | tag | ciphertext).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'v1:';

export const newKey = () => randomBytes(32).toString('base64');

export function makeCipher(keyText) {
  const key = Buffer.from(keyText || '', 'base64');
  if (key.length !== 32) throw new Error('DB_KEY must be 32 random bytes, base64-encoded. Run `npm run keygen` to make one.');
  return {
    seal(value) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
      return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
    },
    // Throws if the text was sealed with another key or has been changed.
    open(text) {
      if (typeof text !== 'string' || !text.startsWith(PREFIX)) throw new Error('Value is not encrypted');
      const raw = Buffer.from(text.slice(PREFIX.length), 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      decipher.setAuthTag(raw.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
    },
  };
}
