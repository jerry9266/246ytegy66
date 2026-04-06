import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import dotenv from "dotenv";
import pkg from 'pg';
import bcrypt from 'bcrypt';

const { Pool } = pkg;
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SALT_ROUNDS = 10;

// --- DATABASE CONNECTION ---
const pool = new Pool({
  connectionString: "postgresql://neondb_owner:npg_yMOtCib9sB5T@ep-shiny-river-am9147yd-pooler.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  ssl: { rejectUnauthorized: false }
});

// --- PAYSTACK CONFIG ---
const PAYSTACK_SECRET = "sk_test_3fe5e5eb9c3d294653f19fe30d4cf63b75305197";
const SUPPORTED_BANKS = [
  { name: "GTBank", code: "058" }, { name: "Access Bank", code: "044" },
  { name: "UBA", code: "033" }, { name: "Zenith Bank", code: "057" },
  { name: "First Bank", code: "011" }, { name: "OPay", code: "999992" },
  { name: "PalmPay", code: "999991" }
];

// --- AUTHENTICATION ROUTES ---

// 1. Signup
app.post("/signup", async (req, res) => {
  const { email, phone, password } = req.body;
  try {
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const result = await pool.query(
      "INSERT INTO users (email, phone, password_hash) VALUES ($1, $2, $3) RETURNING id, email",
      [email, phone, hashedPassword]
    );
    res.status(201).json({ status: true, message: "User created", user: result.rows[0] });
  } catch (error) {
    const message = error.code === '23505' ? "Email already exists" : "Server error";
    res.status(400).json({ status: false, message });
  }
});

// 2. Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0) return res.status(401).json({ status: false, message: "Invalid email or password" });

    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    
    if (match) {
      res.json({ status: true, user: { id: user.id, email: user.email, hasPin: !!user.pin_hash } });
    } else {
      res.status(401).json({ status: false, message: "Invalid email or password" });
    }
  } catch (error) {
    res.status(500).json({ status: false, message: "Server error" });
  }
});

// 3. Set/Update PIN
app.post("/set-pin", async (req, res) => {
  const { email, pin } = req.body; // In a real app, use a JWT/Session ID here
  try {
    const hashedPin = await bcrypt.hash(pin, SALT_ROUNDS);
    await pool.query("UPDATE users SET pin_hash = $1 WHERE email = $2", [hashedPin, email]);
    res.json({ status: true, message: "PIN updated successfully" });
  } catch (error) {
    res.status(500).json({ status: false, message: "Failed to set PIN" });
  }
});

// 4. Verify PIN (Quick Login)
app.post("/verify-pin", async (req, res) => {
  const { email, pin } = req.body;
  try {
    const result = await pool.query("SELECT pin_hash FROM users WHERE email = $1", [email]);
    if (result.rows.length === 0 || !result.rows[0].pin_hash) {
        return res.status(404).json({ status: false, message: "PIN not set" });
    }
    const match = await bcrypt.compare(pin, result.rows[0].pin_hash);
    res.json({ status: match });
  } catch (error) {
    res.status(500).json({ status: false });
  }
});

// --- EXISTING PAYSTACK ROUTES (Kept Intact) ---
app.get("/get-banks", (req, res) => res.json({ status: true, data: SUPPORTED_BANKS }));

app.get("/resolve-account", async (req, res) => {
  const { account_number, bank_code } = req.query;
  const response = await fetch(`https://api.paystack.co/bank/resolve?account_number=${account_number}&bank_code=${bank_code}`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` }
  });
  const data = await response.json();
  res.json(data);
});

app.post("/create-recipient", async (req, res) => {
  const { account_number, bank_code, name } = req.body;
  const response = await fetch("https://api.paystack.co/transferrecipient", {
    method: "POST",
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "nuban", name, account_number, bank_code, currency: "NGN" })
  });
  const data = await response.json();
  res.json(data);
});

app.post("/transfer", async (req, res) => {
  const { amount, recipient_code } = req.body;
  const response = await fetch("https://api.paystack.co/transfer", {
    method: "POST",
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" },
    body: JSON.stringify({ source: "balance", amount: amount * 100, recipient: recipient_code, reason: "Withdrawal" })
  });
  const data = await response.json();
  res.json(data);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
