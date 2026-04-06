import express from "express";
import fetch from "node-fetch";
import cors from "cors";
import bcrypt from 'bcrypt';

const app = express();
app.use(cors());
app.use(express.json());

// --- HARDCODED CONFIGURATION ---
const PORT = 3000;
const SALT_ROUNDS = 10;

// Neon Data API URL
const NEON_API_BASE = "https://ep-shiny-river-am9147yd.apirest.c-5.us-east-1.aws.neon.tech/neondb/rest/v1";

// Paystack Secret Key
const PAYSTACK_SECRET = "sk_test_3fe5e5eb9c3d294653f19fe30d4cf63b75305197";

const SUPPORTED_BANKS = [
    { name: "GTBank", code: "058" }, 
    { name: "Access Bank", code: "044" },
    { name: "UBA", code: "033" }, 
    { name: "Zenith Bank", code: "057" },
    { name: "First Bank", code: "011" }, 
    { name: "OPay", code: "999992" },
    { name: "PalmPay", code: "999991" }
];

// --- AUTHENTICATION ROUTES (Using Neon Data API) ---

// 1. Signup
app.post("/signup", async (req, res) => {
    const { email, phone, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
        
        const response = await fetch(`${NEON_API_BASE}/users`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                email: email, 
                phone: phone, 
                password_hash: hashedPassword 
            })
        });

        if (!response.ok) {
            return res.status(400).json({ status: false, message: "Signup failed (User may already exist)" });
        }

        const data = await response.json();
        res.status(201).json({ status: true, message: "User created", user: data });
    } catch (error) {
        res.status(500).json({ status: false, message: "Server error" });
    }
});

// 2. Login
app.post("/login", async (req, res) => {
    const { email, password } = req.body;
    try {
        // Querying Neon Data API with a filter for email
        const response = await fetch(`${NEON_API_BASE}/users?email=eq.${email}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" }
        });

        const users = await response.json();

        if (!response.ok || users.length === 0) {
            return res.status(401).json({ status: false, message: "Invalid credentials" });
        }

        const user = users[0];
        const match = await bcrypt.compare(password, user.password_hash);

        if (match) {
            res.json({ 
                status: true, 
                user: { id: user.id, email: user.email, hasPin: !!user.pin_hash } 
            });
        } else {
            res.status(401).json({ status: false, message: "Invalid credentials" });
        }
    } catch (error) {
        res.status(500).json({ status: false, message: "Server error" });
    }
});

// 3. Set/Update PIN
app.post("/set-pin", async (req, res) => {
    const { email, pin } = req.body;
    try {
        const hashedPin = await bcrypt.hash(pin, SALT_ROUNDS);
        
        // Patching the user record via Data API
        const response = await fetch(`${NEON_API_BASE}/users?email=eq.${email}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pin_hash: hashedPin })
        });

        if (response.ok) {
            res.json({ status: true, message: "PIN updated successfully" });
        } else {
            res.status(500).json({ status: false, message: "Failed to set PIN" });
        }
    } catch (error) {
        res.status(500).json({ status: false, message: "Server error" });
    }
});

// 4. Verify PIN
app.post("/verify-pin", async (req, res) => {
    const { email, pin } = req.body;
    try {
        const response = await fetch(`${NEON_API_BASE}/users?email=eq.${email}`, {
            method: "GET",
            headers: { "Content-Type": "application/json" }
        });

        const users = await response.json();

        if (!response.ok || users.length === 0 || !users[0].pin_hash) {
            return res.status(404).json({ status: false, message: "PIN not set" });
        }

        const match = await bcrypt.compare(pin, users[0].pin_hash);
        res.json({ status: match });
    } catch (error) {
        res.status(500).json({ status: false });
    }
});

// --- PAYSTACK ROUTES ---

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
        headers: { 
            Authorization: `Bearer ${PAYSTACK_SECRET}`, 
            "Content-Type": "application/json" 
        },
        body: JSON.stringify({ type: "nuban", name, account_number, bank_code, currency: "NGN" })
    });
    const data = await response.json();
    res.json(data);
});

app.post("/transfer", async (req, res) => {
    const { amount, recipient_code } = req.body;
    const response = await fetch("https://api.paystack.co/transfer", {
        method: "POST",
        headers: { 
            Authorization: `Bearer ${PAYSTACK_SECRET}`, 
            "Content-Type": "application/json" 
        },
        body: JSON.stringify({ 
            source: "balance", 
            amount: amount * 100, 
            recipient: recipient_code, 
            reason: "PayVibe Withdrawal" 
        })
    });
    const data = await response.json();
    res.json(data);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
