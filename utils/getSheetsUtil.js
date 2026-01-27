import { google } from "googleapis";
import { readFile } from "fs/promises";
import googleCredentials from "../config/googleCredentials.js";

const config = JSON.parse(
  await readFile(new URL("../config/config.json", import.meta.url))
);

let cachedClient = null;

export async function getSheetsClient() {
  if (cachedClient) return cachedClient;

  const auth = new google.auth.GoogleAuth({
    credentials: googleCredentials,
    scopes: config.scopes
  });

  cachedClient = google.sheets({ version: "v4", auth });
  return cachedClient;
}
