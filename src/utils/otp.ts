import crypto from 'crypto';

/** Generate a cryptographically random 6-digit OTP */
export function generateOtp(): string {
  const buf = crypto.randomBytes(4);
  const num = buf.readUInt32BE(0) % 1000000;
  return num.toString().padStart(6, '0');
}

/** Generate a 6-digit seating OTP (same mechanism, semantically distinct) */
export function generateSeatingOtp(): string {
  return generateOtp();
}
