// utils/googleSheets.js
import { google } from "googleapis";
import { readFile } from "fs/promises";
import dotenv from 'dotenv';
dotenv.config();

const config = JSON.parse(await readFile(new URL("../config/config.json", import.meta.url)));
let cachedClient = null;

export async function getSheetsClient() {
  // Return cached client if already initialized
  if (cachedClient) return cachedClient;

  // Load credentials
  const credentials = JSON.parse(
    await readFile(new URL("../config/credentials.json", import.meta.url))
  );

  // Authenticate
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: config.scopes,
  });

  cachedClient = google.sheets({ version: "v4", auth });
  return cachedClient;
}
