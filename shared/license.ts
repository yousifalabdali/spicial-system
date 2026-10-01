import { createHash } from 'crypto'

export interface LicenseStatus {
  valid: boolean
  shopName?: string
  reason?: string
  expiresAt?: string
}

/** Get machine ID from hardware (simplified version). Real app would use machine-uuid or similar. */
export function getMachineId(): string {
  // This is placeholder - in real app use: npm install machine-uuid
  return (Math.random().toString(36).substring(2) + Date.now().toString(36)).toUpperCase()
}

export async function checkLicense(
  licenseKey: string,
  machineId: string,
  licenseServerUrl: string = 'http://localhost:3000'
): Promise<LicenseStatus> {
  try {
    const res = await fetch(`${licenseServerUrl}/api/license/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey, machineId }),
    })
    return await res.json()
  } catch (err) {
    return { valid: false, reason: 'خطأ في الاتصال بخادم الترخيص' }
  }
}

export async function requestLicense(
  shopName: string,
  machineId: string,
  licenseServerUrl: string = 'http://localhost:3000'
): Promise<{ licenseKey?: string; error?: string }> {
  try {
    const res = await fetch(`${licenseServerUrl}/api/license/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shopName, machineId }),
    })
    const data = await res.json()
    return data.licenseKey ? { licenseKey: data.licenseKey } : { error: data.error }
  } catch (err) {
    return { error: 'خطأ في الاتصال بخادم الترخيص' }
  }
}
