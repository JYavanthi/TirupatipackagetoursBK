const express = require("express");
const axios = require("axios");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors({ origin: "http://localhost:8080", credentials: true }));
app.use(bodyParser.json());

// --- PhonePe Sandbox Test Credentials ---
const MERCHANT_ID = "TEST-M222NJL8ZHVEM_25041";
const CLIENT_SECRET = "NjIxZTdiZGYtMzlkOS00ZTkyLWFhNjItZTZhNTBjNTgyM2I0";
const CLIENT_VERSION = "1";
const SANDBOX_BASE_URL = "https://api-preprod.phonepe.com/apis/pg-sandbox";

// --- Helper: Get OAuth Token ---
async function getOAuthToken() {
  try {
    const formData = new URLSearchParams({
      client_id: MERCHANT_ID,
      client_secret: CLIENT_SECRET,
      client_version: CLIENT_VERSION,
      grant_type: "client_credentials",
    });

    const response = await axios.post(
      `${SANDBOX_BASE_URL}/v1/oauth/token`,
      formData.toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    return response.data.access_token;
  } catch (err) {
    console.error("Error getting OAuth token:", err.response?.data || err.message);
    return null;
  }
}

// --- Create Payment Order ---
app.post("/api/payment/create-order", async (req, res) => {
  try {
    const { merchantOrderId, amount } = req.body;
    if (!merchantOrderId || !amount) {
      return res.status(400).json({ error: "merchantOrderId and amount are required" });
    }

    const token = await getOAuthToken();
    if (!token) return res.status(500).json({ error: "Failed to get OAuth token" });

    const requestBody = {
      merchantOrderId,
      amount: parseInt(amount), // amount in paise
      expireAfter: 1200,
      metaInfo: {},
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: "Payment for testing",
        // merchantUrls: { redirectUrl: `https://api.tirupatipackagetours.com/api/payment/callback` },
        merchantUrls: { 
      redirectUrl: `http://localhost:8080/payment-result?orderId=${merchantOrderId}` 
    },
        paymentModeConfig: {
          enabledPaymentModes: [],
          disabledPaymentModes: [],
        },
      },
    };

    const response = await axios.post(
      `${SANDBOX_BASE_URL}/checkout/v2/pay`,
      requestBody,
      { headers: { Authorization: `O-Bearer ${token}`, "Content-Type": "application/json" } }
    );

    res.json({ orderId: merchantOrderId, phonepeResponse: response.data });
  } catch (err) {
    console.error("Error creating order:", err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data || err.message });
  }
});

// --- Callback Endpoint ---

app.post("/api/payment/callback", async (req, res) => {
  console.log("PhonePe Callback received:", req.body);


 res.sendStatus(200); 
});


// --- Test Endpoint ---
app.get("/", (req, res) => res.send("PhonePe Node.js Sandbox Backend Running"));

// --- Start Server ---
const PORT = 5001;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));

