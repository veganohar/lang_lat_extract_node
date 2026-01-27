// config/googleCredentials.js
import dotenv from "dotenv";

dotenv.config();

const googleCredentials = {
  type: "service_account",
  project_id: process.env.GOOGLE_PROJECT_ID,
  private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
  private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  client_email: process.env.GOOGLE_CLIENT_EMAIL,
  client_id: process.env.GOOGLE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/sheet-reader-service%40shortest-path-441707.iam.gserviceaccount.com",
  universe_domain: "googleapis.com"
};

// 🔐 Fail fast if something critical is missing
if (!googleCredentials.private_key || !googleCredentials.client_email) {
  throw new Error("❌ Missing Google service account env variables");
}

export default googleCredentials;
