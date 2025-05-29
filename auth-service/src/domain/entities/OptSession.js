class OtpSession {
  constructor({ phoneNumber, otpCode, expiresAt, verified }) {
    this.phoneNumber = phoneNumber || "";
    this.otpCode = otpCode || "";
    this.expiresAt = expiresAt || new Date();
    this.verified = verified || false;
  }

  validate() {
    if (!this.phoneNumber || !/^\+?[1-9]\d{1,14}$/.test(this.phoneNumber)) {
      throw new Error("Valid phone number is required");
    }
    if (!this.otpCode || this.otpCode.length < 4 || this.otpCode.length > 6) {
      throw new Error("OTP code must be 4-6 characters");
    }
    if (!this.expiresAt || !(this.expiresAt instanceof Date)) {
      throw new Error("Valid expiration date is required");
    }
  }
}

module.exports = OtpSession;
