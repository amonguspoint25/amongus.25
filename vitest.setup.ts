import * as dotenv from "dotenv";
dotenv.config();
// Route DB-backed tests to the isolated Neon test branch (unpooled, for interactive transactions).
const testUrl = process.env.TEST_DIRECT_URL || process.env.TEST_DATABASE_URL;
if (testUrl) process.env.DATABASE_URL = testUrl;
