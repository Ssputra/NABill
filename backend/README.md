# RT/RW NET Billing — Backend Documentation

## 📋 Persyaratan

| Kebutuhan | Versi |
|-----------|-------|
| Node.js   | ≥ 18  |
| npm       | ≥ 8   |
| MikroTik RouterOS | ≥ 6.x |

---

## 🚀 Cara Install & Jalankan

### 1. Install dependencies

```powershell
cd "C:\Users\prama\OneDrive\Documents\RT-RW NET BILLING\backend"
npm install
```

### 2. Konfigurasi `.env`

Edit file `backend\.env`:

```env
PORT=3000
DB_PATH=./data/billing.db
JWT_SECRET=ganti_dengan_string_rahasia_panjang

MIKROTIK_HOST=192.168.88.1      # IP router MikroTik Anda
MIKROTIK_PORT=8728               # Port API (default 8728)
MIKROTIK_USER=admin              # Username MikroTik API
MIKROTIK_PASS=password_anda      # Password MikroTik
```

### 3. Jalankan server

```powershell
# Mode produksi:
npm start

# Mode development (auto-restart):
npm run dev
```

### 4. Buka di browser

```
http://localhost:3000/
```

---

## 🔧 Konfigurasi MikroTik

Aktifkan API service di MikroTik:

```
/ip service set api disabled=no port=8728
```

Buat user API khusus (disarankan):

```
/user group add name=api-group policy=read,write,api,!local,!telnet,!ssh,!ftp,!reboot,!policy,!test,!web,!sniff,!sensitive,!romon
/user add name=api_user group=api-group password=password_kuat
```

Lalu update `.env`:
```
MIKROTIK_USER=api_user
MIKROTIK_PASS=password_kuat
```

---

## 🔑 Default Login

| Username | Password | Role  |
|----------|----------|-------|
| admin    | admin123 | Admin |
| kasir    | kasir123 | Kasir |

> ⚠️ **Segera ganti password** setelah pertama login!

---

## 📡 API Endpoints

### Auth
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/api/auth/login` | Login, mendapatkan token JWT |
| GET  | `/api/auth/me` | Info user yang sedang login |
| POST | `/api/auth/change-password` | Ganti password |

### Customers
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET    | `/api/customers` | Semua pelanggan (filter: search, status) |
| POST   | `/api/customers` | Tambah pelanggan baru |
| GET    | `/api/customers/:id` | Detail pelanggan |
| PUT    | `/api/customers/:id` | Update pelanggan |
| DELETE | `/api/customers/:id` | Hapus pelanggan (admin only) |
| POST   | `/api/customers/:id/sync-mikrotik` | Sync status ke PPPoE MikroTik |

### Transactions
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET    | `/api/transactions` | Semua transaksi (filter: month, year, status) |
| POST   | `/api/transactions` | Catat transaksi baru |
| PUT    | `/api/transactions/:id` | Update transaksi |
| DELETE | `/api/transactions/:id` | Hapus transaksi (admin only) |

### MikroTik
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET  | `/api/mikrotik/status` | Cek koneksi router |
| GET  | `/api/mikrotik/resources` | CPU, RAM, uptime |
| GET  | `/api/mikrotik/interfaces` | Daftar interface |
| GET  | `/api/mikrotik/traffic?interface=ether1` | Data traffic realtime |
| GET  | `/api/mikrotik/pppoe/active` | Sesi PPPoE aktif |
| GET  | `/api/mikrotik/pppoe/secrets` | Daftar user PPPoE |
| POST | `/api/mikrotik/pppoe/enable` | Aktifkan user PPPoE |
| POST | `/api/mikrotik/pppoe/disable` | Suspend user PPPoE |
| GET  | `/api/mikrotik/hotspot/active` | Sesi hotspot aktif |

### Reports
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/api/reports/summary` | Ringkasan dashboard bulan ini |
| GET | `/api/reports/monthly` | Tren 6 bulan terakhir |
| GET | `/api/reports/by-paket` | Distribusi per paket |
| GET | `/api/reports/overdue-customers` | Pelanggan jatuh tempo |
| GET | `/api/reports/export/excel?month=3&year=2026` | Export Excel |

---

## 📁 Struktur File

```
RT-RW NET BILLING/
├── api.js                    ← Frontend API helper
├── index.html
├── customers.html
├── kasir.html
├── laporan.html
├── mikrotik-monitoring.html
└── backend/
    ├── server.js             ← Entry point
    ├── config.js             ← Konfigurasi
    ├── db.js                 ← Database SQLite
    ├── .env                  ← Environment variables
    ├── data/
    │   └── billing.db        ← File SQLite (auto-created)
    ├── routes/
    │   ├── auth.js
    │   ├── customers.js
    │   ├── transactions.js
    │   ├── mikrotik.js
    │   └── reports.js
    ├── services/
    │   └── mikrotik.js       ← RouterOS API client
    └── middleware/
        └── auth.js           ← JWT middleware
```
