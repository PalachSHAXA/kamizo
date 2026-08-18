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

  it('preserves valid signed impersonation claims', async () => {
    const payload = {
      userId: 'tenant-admin',
      role: 'admin',
      tenantId: 'tenant1',
      imp: true,
      imp_by: 'super-admin-1',
    } satisfies Parameters<typeof createJWT>[0]
    const token = await createJWT(payload, secret, 3600)

    expect(await verifyJWT(token, secret)).toEqual(payload)
  })

  it('preserves a signed demo session capability', async () => {
    const payload = {
      userId: 'demo-manager',
      role: 'manager',
      tenantId: 'tenant-demo',
      demo_session: true,
    } satisfies Parameters<typeof createJWT>[0]

    expect(await verifyJWT(await createJWT(payload, secret, 1800), secret)).toEqual(payload)
  })

  it('drops a malformed demo capability while preserving valid impersonation claims', async () => {
    const payload = {
      userId: 'tenant-admin',
      role: 'admin',
      tenantId: 'tenant1',
      demo_session: 'true',
      imp: true,
      imp_by: 'super-admin-1',
    }

    expect(await verifyJWT(
      await createJWT(payload as unknown as Parameters<typeof createJWT>[0], secret, 1800),
      secret,
    )).toEqual({
      userId: 'tenant-admin', role: 'admin', tenantId: 'tenant1', imp: true, imp_by: 'super-admin-1',
    })
  })

  it('ignores malformed impersonation claims in an otherwise valid token', async () => {
    const payload = {
      userId: 'tenant-admin',
      role: 'admin',
      tenantId: 'tenant1',
      imp: 'true',
      imp_by: 123,
    }
    const token = await createJWT(payload as unknown as Parameters<typeof createJWT>[0], secret, 3600)

    expect(await verifyJWT(token, secret)).toEqual({
      userId: 'tenant-admin',
      role: 'admin',
      tenantId: 'tenant1',
    })
  })

  it('rejects an impersonation actor forged after signing', async () => {
    const token = await createJWT({ userId: 'tenant-admin', role: 'admin', tenantId: 'tenant1' }, secret, 3600)
    const [header, encodedPayload, signature] = token.split('.')
    const payload = JSON.parse(atob(encodedPayload.replace(/-/g, '+').replace(/_/g, '/')))
    payload.imp = true
    payload.imp_by = 'forged-super-admin'
    const forgedPayload = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    expect(await verifyJWT(`${header}.${forgedPayload}.${signature}`, secret)).toBeNull()
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
