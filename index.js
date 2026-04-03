import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Hardcoded Test Keys
const PAYSTACK_SECRET = "sk_test_3fe5e5eb9c3d294653f19fe30d4cf63b75305197";
const PAYSTACK_PUBLIC = "pk_test_ee7c8c7fc7568689ca56e9f26ed2a8ae0712ccbd";

// Hardcoded Bank List
const SUPPORTED_BANKS = [
  { name: "GTBank", code: "058" },
  { name: "Access Bank", code: "044" },
  { name: "UBA", code: "033" },
  { name: "Zenith Bank", code: "057" },
  { name: "First Bank", code: "011" },
  { name: "FCMB", code: "214" },
  { name: "Fidelity Bank", code: "070" },
  { name: "Sterling Bank", code: "232" },
  { name: "Union Bank", code: "032" },
  { name: "Wema Bank", code: "035" },
  { name: "Stanbic IBTC", code: "221" },
  { name: "Ecobank", code: "050" },
  { name: "OPay", code: "999992" },
  { name: "PalmPay", code: "999991" },
  { name: "Polaris Bank", code: "076" }
];

// ✅ Health check
app.get("/", (req, res) => {
  res.send("PayVibe Backend Running 🚀");
});

// ✅ Get Hardcoded Banks (Fast for App UI)
app.get("/get-banks", (req, res) => {
  res.json({
    status: true,
    message: "Banks retrieved successfully",
    data: SUPPORTED_BANKS
  });
});

// ✅ Resolve Account Number
app.get("/resolve-account", async (req, res) => {
  const { account_number, bank_code } = req.query;

  if (!account_number || !bank_code) {
    return res.status(400).json({
      status: false,
      message: "Account number and bank code required"
    });
  }

  try {
    const response = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json"
        }
      }
    );

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    console.error("Resolve Error:", error);
    res.status(500).json({ status: false, message: "Server error" });
  }
});

// ✅ Create Transfer Recipient
app.post("/create-recipient", async (req, res) => {
  const { account_number, bank_code, name } = req.body;

  try {
    const response = await fetch(
      "https://api.paystack.co/transferrecipient",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          type: "nuban",
          name,
          account_number,
          bank_code,
          currency: "NGN"
        })
      }
    );

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Recipient Error:", error);
    res.status(500).json({ status: false });
  }
});

// ✅ Send Money
app.post("/transfer", async (req, res) => {
  const { amount, recipient_code } = req.body;

  try {
    const response = await fetch(
      "https://api.paystack.co/transfer",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          source: "balance",
          amount: amount * 100, // convert to kobo
          recipient: recipient_code,
          reason: "Withdrawal"
        })
      }
    );

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Transfer Error:", error);
    res.status(500).json({ status: false });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
