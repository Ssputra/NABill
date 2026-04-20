require('dotenv').config();

const config = {
  port: parseInt(process.env.PORT) || 3000,
  dbPath: process.env.DB_PATH || './data/billing.db',
  jwtSecret: process.env.JWT_SECRET || 'default_secret_GANTI_DI_PRODUCTION',
  jwtExpiry: '8h',  // Session berlaku 8 jam

  mikrotik: {
    host: process.env.MIKROTIK_HOST || '192.168.88.1',
    port: parseInt(process.env.MIKROTIK_PORT) || 8728,
    user: process.env.MIKROTIK_USER || 'admin',
    password: process.env.MIKROTIK_PASS || '',
    timeout: parseInt(process.env.MIKROTIK_TIMEOUT) || 10,
  },

  app: {
    name: process.env.APP_NAME || 'RT/RW NET Billing',
    version: process.env.APP_VERSION || '2.0',
  },

  cors: {
    // Izinkan akses dari file:// dan localhost
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000', 'null'],
    credentials: true,
  },
};

module.exports = config;
