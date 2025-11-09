const crypto = require("crypto");

// ⚠️ এখানে শুধু নিচের ২টি মান নিজের ZEGO Dashboard থেকে কপি করে বসাও:
const APP_ID = 1793173560; // ← তোমার AppID
const SERVER_SECRET="899cf8580d525a15f1efc75f3a7bbd02"; // ← তোমার Server Secret বসাও

function getTokenFor(userID = `user_${Date.now()}`, roomID = "room") {
  const effectiveTimeInSeconds = 3600; // ১ ঘণ্টা টোকেন valid থাকবে
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    app_id: APP_ID,
    user_id: String(userID),
    ctime: now,
    expire: effectiveTimeInSeconds,
    payload: {
      room_id: String(roomID),
      privilege: { 1: 1, 2: 1 },
    },
  };

  const payloadStr = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadStr).toString("base64");
  const hash = crypto
    .createHmac("sha256", SERVER_SECRET)
    .update(payloadStr)
    .digest("hex");

  const token = `${hash}.${payloadBase64}`;

  return {
    appID: APP_ID,
    userID,
    roomID,
    token,
    expire: effectiveTimeInSeconds,
  };
}

module.exports = { getTokenFor };