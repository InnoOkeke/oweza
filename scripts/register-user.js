require("dotenv/config");

const [userId, email, walletAddress, displayName = "", avatar = ""] = process.argv.slice(2);

if (!userId || !email || !walletAddress) {
  console.error("Usage: node scripts/register-user.js <userId> <email> <wallet> [displayName] [avatar]");
  process.exit(1);
}

const baseUrl = process.env.METASEND_API_BASE_URL || "https://metasend.vercel.app";
const apiKey = process.env.METASEND_API_KEY;

if (!apiKey) {
  console.error("METASEND_API_KEY is not set");
  process.exit(1);
}

(async () => {
  try {
    const response = await fetch(`${baseUrl}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        userId,
        email,
        emailVerified: true,
        walletAddress,
        displayName: displayName || email.split("@")[0],
        avatar: avatar || undefined,
      }),
    });

    console.log("status", response.status);
    const body = await response.text();
    console.log(body);
  } catch (error) {
    console.error("request failed", error);
    process.exit(1);
  }
})();
