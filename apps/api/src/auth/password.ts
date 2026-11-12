import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 64;
// One of the scrypt configurations recommended by OWASP (N=2^15, r=8, p=3).
// It needs about 32 MB per hash, which fits small hosting instances.
const COST = 32768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 3;

function derive(
  password: string,
  salt: Buffer,
  cost: number,
  blockSize: number,
  parallelization: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      salt,
      KEY_LENGTH,
      {
        N: cost,
        r: blockSize,
        p: parallelization,
        maxmem: 256 * cost * blockSize,
      },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

/** Returns `scrypt$N$r$p$salt$hash` with salt and hash hex-encoded. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLELIZATION);
  return [
    'scrypt',
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString('hex'),
    key.toString('hex'),
  ].join('$');
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [scheme, cost, blockSize, parallelization, saltHex, hashHex] =
    stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) {
    return false;
  }
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await derive(
    password,
    Buffer.from(saltHex, 'hex'),
    Number(cost),
    Number(blockSize),
    Number(parallelization),
  );
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
