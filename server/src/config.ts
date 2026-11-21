import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

const nodeEnv = optional("NODE_ENV", "development");
const jwtSecret = optional("JWT_SECRET", "dev-secret-change-me");
const jwtRefreshSecret = optional("JWT_REFRESH_SECRET", "dev-refresh-secret-change-me");
const storageType = optional("STORAGE_TYPE", "local");

if (nodeEnv === "production") {
  if (jwtSecret.length < 32 || jwtSecret === "dev-secret-change-me") {
    throw new Error("JWT_SECRET must be set to a unique value of at least 32 characters in production");
  }
  if (jwtRefreshSecret.length < 32 || jwtRefreshSecret === "dev-refresh-secret-change-me") {
    throw new Error("JWT_REFRESH_SECRET must be set to a unique value of at least 32 characters in production");
  }
}
if (storageType !== "local" && storageType !== "supabase") {
  throw new Error("STORAGE_TYPE must be either local or supabase");
}

export const config = {
  nodeEnv,
  port: parseInt(optional("SERVER_PORT", "4000"), 10),
  origin: optional("SERVER_ORIGIN", "http://localhost:3000"),
  corsOrigins: optional("CORS_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),

  db: {
    url: required("DATABASE_URL"),
  },

  jwt: {
    secret: jwtSecret,
    expiresIn: optional("JWT_EXPIRES_IN", "15m"),
    refreshSecret: jwtRefreshSecret,
    refreshExpiresIn: optional("JWT_REFRESH_EXPIRES_IN", "7d"),
  },

  whatsapp: {
    token: optional("WHATSAPP_TOKEN"),
    phoneNumberId: optional("WHATSAPP_PHONE_NUMBER_ID"),
    webhookVerifyToken: optional("WHATSAPP_WEBHOOK_VERIFY_TOKEN"),
  },

  mpesa: {
    consumerKey: optional("MPESA_CONSUMER_KEY"),
    consumerSecret: optional("MPESA_CONSUMER_SECRET"),
    shortcode: optional("MPESA_SHORTCODE"),
    passkey: optional("MPESA_PASSKEY"),
    callbackUrl: optional("MPESA_CALLBACK_URL"),
  },

  airtel: {
    clientId: optional("AIRTEL_CLIENT_ID"),
    clientSecret: optional("AIRTEL_CLIENT_SECRET"),
    baseUrl: optional("AIRTEL_BASE_URL", "https://openapi.airtel.africa"),
    callbackUrl: optional("AIRTEL_CALLBACK_URL"),
  },

  tigo: {
    billerCode: optional("TIGO_BILLER_CODE"),
    billerPin: optional("TIGO_BILLER_PIN"),
    baseUrl: optional("TIGO_BASE_URL"),
    callbackUrl: optional("TIGO_CALLBACK_URL"),
  },

  // NextSMS API v2 (messaging-service.co.tz)
  nextsms: {
    apiToken: optional("NEXTSMS_API_TOKEN", ""),
    senderId: optional("NEXTSMS_SENDER_ID", "ENTRON"),
    whatsappAccount: optional("NEXTSMS_WHATSAPP_ACCOUNT", ""),
    whatsappTemplate: optional("NEXTSMS_WHATSAPP_TEMPLATE", ""),
    whatsappMessageParameter: optional("NEXTSMS_WHATSAPP_MESSAGE_PARAMETER", "message"),
  },

  storage: {
    type: storageType,
    uploadDir: optional("UPLOAD_DIR", "./uploads"),
    supabaseUrl: optional("SUPABASE_URL"),
    supabaseServiceRoleKey: optional("SUPABASE_SERVICE_ROLE_KEY"),
    publicBucket: optional("SUPABASE_PUBLIC_BUCKET", "entron-public"),
    privateBucket: optional("SUPABASE_PRIVATE_BUCKET", "entron-private"),
  },
} as const;
