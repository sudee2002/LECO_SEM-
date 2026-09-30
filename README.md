# Smart Grid Electricity Meter Management System (LECO / CEB Platform)

> **EE5206 Software Group Project** — Phase-by-Phase Full-Stack Prepaid Electricity Platform Implementation

---

## ⚡ Overview

The **Smart Grid Electricity Meter Management System** is an end-to-end prepaid electricity platform built for LECO/CEB smart grid operations.

A smart meter reports electricity consumption; the backend converts incremental kWh usage into a monetary charge using a configurable Sri Lankan domestic block tariff schedule; the charge is deducted from the customer's prepaid wallet ledger. When usable credit is exhausted, the system issues a controlled power disconnect command. A verified top-up credits the wallet and automatically triggers a power reconnect.

---

## 🚀 Key Features

- **Role-Based Access Control (RBAC)**: JWT authenticated access for `Customer`, `Admin`, and `Utility Operator` roles.
- **Dynamic Tiered Tariff Engine**: Configurable Sri Lankan domestic tariff slabs (0-30, 31-60, 61-90, 91-180, 180+ kWh) with fixed monthly charges.
- **Smart Meter Telemetry Simulator**: Live pulse triggers (`+0.5 kWh`, `+1.5 kWh`, `+5.0 kWh`) simulating meter readings over REST API.
- **Deterministic Power Cutoff & Auto-Reconnect**: Automatic relay disconnect on balance depletion ($\le 0$) and instant restoration upon verified top-up ($> 0$).
- **PayHere Sandbox Gateway Modal**: Interactive payment checkout with verified server-to-server webhook callbacks and idempotency protection.
- **Predictive "Days Remaining" Engine**: Statistical consumption forecasting calculating estimated balance depletion timeline.
- **Smart AI Support Assistant**: Account-aware customer care chatbot using safe, read-only tools.
- **Platform Audit Trail**: Complete security event, payment callback, relay state toggle, and tariff modification logging.
- **Glassmorphic React UI**: Cyber dark aesthetic with one-click **Demo Role Switchers** (`Sunil Consumer`, `Kamal Low Bal`, `System Admin`).

---

## 🛠️ Tech Stack

- **Frontend**: React, Vite, Lucide Icons, Recharts, Custom CSS (Glassmorphism design system)
- **Backend**: Node.js, Express, JWT, Bcrypt
- **Database**: SQLite (`sql.js` WASM engine with 0 native C++ dependencies)
- **Architecture**: Monorepo with static frontend build served via Express on `http://localhost:5000`

---

## 🔑 Demo Accounts

| **System Admin** | `admin@leco.lk` | `Password123!` | N/A | Full Admin Access |
| **Consumer** | `consumer@leco.lk` | `Password123!` | **LKR 2,500.00** | `MTR-1001` (Colombo) |

---

## 🏁 Quick Start Guide

### 1. Installation
```bash
npm run setup
```

### 2. Seed Database
```bash
npm run seed
```

### 3. Build & Run Application
```bash
npm run build
npm start
```
Access the platform live in browser at: **`http://localhost:5000`**
