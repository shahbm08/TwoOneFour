// Run: cd api && npm install && npm test
import { test, mock } from "node:test";
import assert from "node:assert/strict";

const sent = [];
let putError = null;
class Cmd { constructor(input) { this.input = input; } }
mock.module("@aws-sdk/client-sesv2", { namedExports: {
  SESv2Client: class { async send(c) { sent.push(["ses", c.input]); return {}; } },
  SendEmailCommand: Cmd,
}});
mock.module("@aws-sdk/client-dynamodb", { namedExports: {
  DynamoDBClient: class { async send(c) { if (putError) throw putError; sent.push(["ddb", c.input]); return {}; } },
  PutItemCommand: Cmd,
}});

process.env.ORIGIN_SECRET = "s3cret";
process.env.FROM_ADDRESS = "website@twoonefour.com.au";
process.env.NOTIFY_ADDRESS = "owner@example.com";
process.env.SUBSCRIBERS_TABLE = "subs";
const { handler } = await import("../index.mjs");

const ev = (path, body, secret = "s3cret") => ({
  rawPath: path,
  headers: { "x-origin-verify": secret, "x-forwarded-for": "203.0.113.5" },
  requestContext: { http: { method: "POST" } },
  body: JSON.stringify(body),
});
const good = { name: "Ann", email: "ann@example.com", message: "Hi", consent: true, website: "" };

test("refuses requests without CloudFront's secret", async () => {
  assert.equal((await handler(ev("/api/contact", good, "nope"))).statusCode, 403);
});

test("sends a contact message with reply-to set", async () => {
  sent.length = 0;
  const r = await handler(ev("/api/contact", good));
  assert.equal(r.statusCode, 200);
  assert.equal(sent[0][1].ReplyToAddresses[0], "ann@example.com");
  assert.equal(sent[0][1].Destination.ToAddresses[0], "owner@example.com");
});

test("strips newlines from header fields", async () => {
  sent.length = 0;
  await handler(ev("/api/contact", { ...good, name: "Ann\r\nBcc: x@y.z" }));
  assert.ok(!/[\r\n]/.test(sent[0][1].Content.Simple.Subject.Data));
});

test("rejects bad input", async () => {
  assert.equal((await handler(ev("/api/contact", { ...good, email: "nope" }))).statusCode, 400);
  assert.equal((await handler(ev("/api/contact", { ...good, consent: false }))).statusCode, 400);
  assert.equal((await handler(ev("/api/contact", { ...good, message: "" }))).statusCode, 400);
});

test("honeypot pretends success and sends nothing", async () => {
  sent.length = 0;
  const r = await handler(ev("/api/contact", { ...good, website: "spam.example" }));
  assert.equal(r.statusCode, 200);
  assert.equal(sent.length, 0);
});

test("subscribe stores lowercased email and notifies", async () => {
  sent.length = 0;
  const r = await handler(ev("/api/subscribe", { email: "Ann@Example.com", website: "" }));
  assert.equal(r.statusCode, 200);
  assert.equal(sent[0][1].Item.email.S, "ann@example.com");
  assert.equal(sent[1][0], "ses");
});

test("duplicate subscribe answers the same", async () => {
  putError = Object.assign(new Error("dup"), { name: "ConditionalCheckFailedException" });
  const r = await handler(ev("/api/subscribe", { email: "ann@example.com" }));
  putError = null;
  assert.equal(r.statusCode, 200);
});

test("unknown path and method", async () => {
  assert.equal((await handler(ev("/api/other", good))).statusCode, 404);
  const e = ev("/api/contact", good); e.requestContext.http.method = "GET";
  assert.equal((await handler(e)).statusCode, 405);
});
