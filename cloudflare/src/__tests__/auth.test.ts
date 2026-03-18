import { describe, it, expect } from 'vitest'
import { createJWT, verifyJWT, hashPassword, verifyPassword } from '../utils/crypto'

describe('JWT', () => {
  const secret = 'test-secret-key-for-jwt-testing'

  it('createJWT + verifyJWT roundtrip', async () => {
    const payload = { userId: 'user1', role: 'admin', tenantId: 'tenant1' }
    const token = await createJWT(payload, secret, 3600)
    const result = await verifyJWT(token, secret)
    expect(result).not.toBeNull()
    expect(result!.userId).toBe('user1')
    expect(result!.role).toBe('admin')
    expect(result!.tenantId).toBe('tenant1')
  })

  it('verifyJWT with wrong secret returns null', async () => {
    const token = await createJWT({ userId: 'u1', role: 'r' }, secret, 3600)
    const result = await verifyJWT(token, 'wrong-secret')
    expect(result).toBeNull()
  })

  it('verifyJWT with expired token returns null', async () => {
    const token = await createJWT({ userId: 'u1', role: 'r' }, secret, -1)
    const result = await verifyJWT(token, secret)
    expect(result).toBeNull()
  })

  it('verifyJWT with invalid token returns null', async () => {
    const result = await verifyJWT('invalid.token.here', secret)
    expect(result).toBeNull()
  })

  it('verifyJWT with malformed string returns null', async () => {
    const result = await verifyJWT('not-a-jwt', secret)
    expect(result).toBeNull()
  })
})

describe('Password hashing', () => {
  it('hashPassword + verifyPassword roundtrip', async () => {
    const hash = await hashPassword('mypassword123')
    const valid = await verifyPassword('mypassword123', hash)
    expect(valid).toBe(true)
  })

  it('verifyPassword fails with wrong password', async () => {
    const hash = await hashPassword('correct-password')
    const valid = await verifyPassword('wrong-password', hash)
    expect(valid).toBe(false)
  })

  it('hashPassword produces iterations:salt:hash format', async () => {
    const hash = await hashPassword('test')
    const parts = hash.split(':')
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe('50000')
  })

  it('different passwords produce different hashes', async () => {
    const hash1 = await hashPassword('password1')
    const hash2 = await hashPassword('password2')
    expect(hash1).not.toBe(hash2)
  })
})
