require("dotenv/config");

const email = process.argv[2];
if (!email) {
  console.error("Usage: node scripts/list-pending.js <recipientEmail>");
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
    const response = await fetch(`${baseUrl}/api/pending-transfers?recipientEmail=${encodeURIComponent(email)}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });
    console.log("status", response.status);
    const body = await response.text();
    console.log(body);
  } catch (error) {
    console.error("request failed", error);
    process.exit(1);
  }
})();
