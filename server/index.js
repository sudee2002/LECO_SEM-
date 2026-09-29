const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const { initSchema } = require('./db/database');
const authRoutes = require('./routes/auth');
const meterRoutes = require('./routes/meters');
const tariffRoutes = require('./routes/tariffs');
const walletRoutes = require('./routes/wallet');
const paymentRoutes = require('./routes/payment');
const predictionRoutes = require('./routes/predictions');
const aiRoutes = require('./routes/ai');
const auditRoutes = require('./routes/audit');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/meters', meterRoutes);
app.use('/api/tariffs', tariffRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/audit', auditRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'Smart Grid Prepaid Electricity Platform (LECO/CEB)',
    timestamp: new Date().toISOString()
  });
});

// Serve frontend static build if available
const clientDistPath = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(clientDistPath, 'index.html'));
    }
  });
}

// Start Server
async function startServer() {
  try {
    console.log('Ensuring SQLite Database Schema...');
    await initSchema();

    app.listen(PORT, () => {
      console.log(`⚡ LECO SEM Full-Stack Server listening on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
