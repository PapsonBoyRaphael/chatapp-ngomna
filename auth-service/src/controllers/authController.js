const OtpSession = require("../models/OtpSession");
const User = require("../models/user");
const jwt = require("jsonwebtoken");
const { generateOtp } = require("../utils/otpGenerator");
const { sendOtp } = require("../services/otpService");
const logger = require("../config/logger"); // Ajoutez un système de logs

// Durées configurables
const OTP_EXPIRATION_MINUTES = 5;
const JWT_EXPIRATION_DAYS = "7d";

exports.requestOtp = async (req, res, next) => {
  try {
    const { phoneNumber } = req.body;

    // Validation basique
    if (!phoneNumber || !/^\+?[\d\s-]{10,}$/.test(phoneNumber)) {
      return res.status(400).json({ message: "Numéro de téléphone invalide" });
    }

    // Génération et stockage OTP
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60000);

    await OtpSession.findOneAndUpdate(
      { phoneNumber },
      { otpCode: otp, expiresAt, verified: false },
      { upsert: true, new: true }
    );

    // Envoi asynchrone pour éviter de bloquer la réponse
    sendOtp(phoneNumber, otp)
      .then(() => logger.info(`OTP envoyé à ${phoneNumber}`))
      .catch((err) => logger.error("Erreur d'envoi OTP:", err));

    res.status(200).json({
      success: true,
      message: "OTP envoyé",
      expiresIn: `${OTP_EXPIRATION_MINUTES} minutes`,
    });
  } catch (error) {
    logger.error("Erreur requestOtp:", error);
    next(error); // Transmet à votre middleware errorHandler
  }
};

exports.verifyOtp = async (req, res, next) => {
  try {
    const { phoneNumber, otpCode } = req.body;

    // 1. Vérifier l'OTP
    const session = await OtpSession.findOne({
      phoneNumber,
      otpCode,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        message: "OTP invalide ou expiré",
      });
    }

    // 2. Créer/mettre à jour l'utilisateur
    let user = await User.findOne({ phoneNumber });
    const isNewUser = !user;

    if (isNewUser) {
      user = await User.create({
        phoneNumber,
        role: "user", // Par défaut
        authMethod: "otp",
      });
      logger.info(`Nouvel utilisateur créé: ${phoneNumber}`);
    }

    // 3. Générer le JWT
    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: JWT_EXPIRATION_DAYS }
    );

    // 4. Nettoyer la session OTP
    await OtpSession.deleteOne({ _id: session._id });

    res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        role: user.role,
        isNewUser,
      },
    });
  } catch (error) {
    logger.error("Erreur verifyOtp:", error);
    next(error);
  }
};
