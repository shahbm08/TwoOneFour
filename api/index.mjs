// Form handler for twoonefour.com.au, served at /api/* through CloudFront.
//
//   POST /api/contact    { name, email, phone?, message, consent, website }
//   POST /api/subscribe  { email, website }
//
// Contact messages are emailed to the owner with SES (Reply-To set to the
// visitor). Newsletter sign-ups are saved in DynamoDB and the owner gets a
// short notice. `website` is a honeypot: people leave it empty, bots fill it.
//
// The function URL is public, so CloudFront adds a secret header and anything
// arriving without it is refused. That keeps the URL from being used directly.
// Each visitor address may send at most RATE_LIMIT forms an hour.

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

const ses = new SESv2Client({});
const ddb = new DynamoDBClient({});

const {
  ORIGIN_SECRET,
  FROM_ADDRESS,
  NOTIFY_ADDRESS,
  SUBSCRIBERS_TABLE,
  RATE_TABLE,
} = process.env;
const RATE_LIMIT = Number(process.env.RATE_LIMIT || 5);

const TOPICS = new Set([
  "A new website", "Custom software", "Cloud & hosting", "Security", "IT strategy", "Something else",
]);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BODY = 16 * 1024;

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-robots-tag": "noindex",
  },
  body: JSON.stringify(body),
});

const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
// Strip CR/LF so nothing a visitor types can become an extra mail header.
const oneLine = (v) => v.replace(/[\r\n]+/g, " ");

export const handler = async (event) => {
  const headers = event.headers || {};
  if (!ORIGIN_SECRET || headers["x-origin-verify"] !== ORIGIN_SECRET) {
    return json(403, { error: "Forbidden" });
  }

  const method = event.requestContext?.http?.method;
  const path = event.rawPath || "";
  if (method !== "POST") return json(405, { error: "Method not allowed" });

  let raw = event.body || "";
  if (event.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");
  if (raw.length > MAX_BODY) return json(413, { error: "That message is too long." });

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return json(400, { error: "Something went wrong. Please try again." });
  }

  // Honeypot filled in: pretend it worked so the bot moves on.
  if (clean(data.website, 200)) return json(200, { message: "Thank you." });

  const ip = headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";

  try {
    if (!(await allowed(ip))) {
      return json(429, { error: "Too many messages from this connection. Please try again in an hour." });
    }
    if (path.endsWith("/contact")) return await contact(data, ip);
    if (path.endsWith("/subscribe")) return await subscribe(data, ip);
    return json(404, { error: "Not found" });
  } catch (err) {
    console.error(JSON.stringify({ msg: "form failed", path, error: String(err) }));
    return json(502, { error: "Sorry, that didn't send. Please try again in a moment." });
  }
};

async function contact(data, ip) {
  const name = oneLine(clean(data.name, 120));
  const email = oneLine(clean(data.email, 200));
  const phone = oneLine(clean(data.phone, 40));
  const message = clean(data.message, 4000);
  const topic = TOPICS.has(data.topic) ? data.topic : "Not given";

  if (!name || !message) return json(400, { error: "Please fill in your name and message." });
  if (!EMAIL.test(email)) return json(400, { error: "Please enter a valid email address." });
  if (data.consent !== true) return json(400, { error: "Please tick the box to agree to the privacy notice." });

  const text = [
    `Name:    ${name}`,
    `Email:   ${email}`,
    `Phone:   ${phone || "-"}`,
    `Topic:   ${topic}`,
    `Sent:    ${new Date().toISOString()}`,
    `From IP: ${ip}`,
    "",
    message,
  ].join("\n");

  await ses.send(new SendEmailCommand({
    FromEmailAddress: `TwoOneFour website <${FROM_ADDRESS}>`,
    Destination: { ToAddresses: [NOTIFY_ADDRESS] },
    ReplyToAddresses: [email],
    Content: {
      Simple: {
        Subject: { Data: `Website enquiry from ${name}: ${topic}`, Charset: "UTF-8" },
        Body: { Text: { Data: text, Charset: "UTF-8" } },
      },
    },
  }));

  return json(200, { message: "Thank you. We'll be in touch soon." });
}

async function subscribe(data, ip) {
  const email = oneLine(clean(data.email, 200)).toLowerCase();
  if (!EMAIL.test(email)) return json(400, { error: "Please enter a valid email address." });

  try {
    await ddb.send(new PutItemCommand({
      TableName: SUBSCRIBERS_TABLE,
      Item: {
        email: { S: email },
        subscribedAt: { S: new Date().toISOString() },
        ip: { S: ip },
      },
      ConditionExpression: "attribute_not_exists(email)",
    }));
  } catch (err) {
    // Already on the list: same answer, so the form can't be used to check who subscribed.
    if (err.name === "ConditionalCheckFailedException") {
      return json(200, { message: "Thank you. You're on the list." });
    }
    throw err;
  }

  await ses.send(new SendEmailCommand({
    FromEmailAddress: `TwoOneFour website <${FROM_ADDRESS}>`,
    Destination: { ToAddresses: [NOTIFY_ADDRESS] },
    Content: {
      Simple: {
        Subject: { Data: "New newsletter sign-up", Charset: "UTF-8" },
        Body: { Text: { Data: `${email} subscribed at ${new Date().toISOString()}.`, Charset: "UTF-8" } },
      },
    },
  })).catch((err) => console.error(JSON.stringify({ msg: "notify failed", error: String(err) })));

  return json(200, { message: "Thank you. You're on the list." });
}

// A counter per visitor address per hour; DynamoDB deletes old rows itself (TTL).
async function allowed(ip) {
  if (!RATE_TABLE) return true;
  const hour = Math.floor(Date.now() / 3_600_000);
  const res = await ddb.send(new UpdateItemCommand({
    TableName: RATE_TABLE,
    Key: { id: { S: `${ip}#${hour}` } },
    UpdateExpression: "ADD hits :one SET expiresAt = if_not_exists(expiresAt, :exp)",
    ExpressionAttributeValues: {
      ":one": { N: "1" },
      ":exp": { N: String((hour + 2) * 3600) },
    },
    ReturnValues: "UPDATED_NEW",
  }));
  return Number(res.Attributes?.hits?.N || 0) <= RATE_LIMIT;
}
