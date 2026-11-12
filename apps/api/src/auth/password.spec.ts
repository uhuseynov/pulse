import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the original password', async () => {
    const hash = await hashPassword('correct-horse-battery');
    await expect(verifyPassword('correct-horse-battery', hash)).resolves.toBe(
      true,
    );
  });

  it('rejects a different password', async () => {
    const hash = await hashPassword('correct-horse-battery');
    await expect(verifyPassword('wrong', hash)).resolves.toBe(false);
  });

  it('salts every hash and never stores the password itself', async () => {
    const [first, second] = await Promise.all([
      hashPassword('same-password'),
      hashPassword('same-password'),
    ]);
    expect(first).not.toBe(second);
    expect(first).not.toContain('same-password');
  });

  it('rejects malformed stored values instead of throwing', async () => {
    await expect(verifyPassword('anything', 'not-a-hash')).resolves.toBe(false);
    await expect(verifyPassword('anything', '')).resolves.toBe(false);
  });
});
