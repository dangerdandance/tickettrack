// Uses GOOGLE_ACCESS_TOKEN directly from environment variable
// Update this token in Vercel env vars when it expires (~1 hour)
export async function getGoogleToken() {
  const token = process.env.GOOGLE_ACCESS_TOKEN;
  if (!token) throw new Error("GOOGLE_ACCESS_TOKEN not set in environment variables");
  return token;
}
