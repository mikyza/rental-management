import dns from 'dns';
dns.setDefaultResultOrder('ipv4first');

import express from 'express';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// ==========================================
// 0. SYSTEM INITIALIZATION & PATHS
// ==========================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dev = process.env.NODE_ENV !== 'production';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_SECRET_REAL_ESTATE_KEY_2026';
const MONGODB_URI = process.env.MONGODB_URI;

console.log('🚀 Initializing Full-Stack Property Rental & Real Estate Backend...');
console.log('DEBUG: Booting unified property management architecture...');

const nextApp = next({ 
  dev, 
  hostname, 
  port,
  dir: path.join(__dirname, '../frontend/my-app') 
});
const nextHandler = nextApp.getRequestHandler();

// ==========================================
// 1. OFFLINE UPLOAD CONFIGURATION (MULTER)
// ==========================================
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log('DEBUG: Created missing upload directory at', uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'))
});
const upload = multer({ storage });

// ==========================================
// 2. DATABASE SCHEMAS & MODELS
// ==========================================
import { 
  User, 
  Property, 
  Unit, 
  Lease,
  MaintenanceTicket,
  AdminLog, 
  SystemConfig
} from './lib/db.js';

// ==========================================
// 3. MIDDLEWARES
// ==========================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) {
    console.log('DEBUG: Auth failed - Missing token');
    return res.status(401).json({ error: 'Access token missing' });
  }

  jwt.verify(token, JWT_SECRET, (err, decodedUser) => {
    if (err) {
      console.log('DEBUG: Auth failed - Invalid token');
      return res.status(403).json({ error: 'Token invalid or expired' });
    }
    req.user = decodedUser;
    next();
  });
};

const requireRole = (roles) => async (req, res, next) => {
  try {
    const userInstance = await User.findById(req.user.id);
    if (!userInstance || !roles.includes(userInstance.role)) {
      console.log(`DEBUG: Clearance rejected for user ID: ${req.user.id}. Required roles: ${roles.join(',')}`);
      return res.status(403).json({ error: 'Access denied. Insufficient privileges.' });
    }
    if (!userInstance.isActive) return res.status(403).json({ error: 'Account disabled' });
    req.dbUser = userInstance;
    next();
  } catch (error) {
    console.error('DEBUG: Role evaluation crash:', error);
    res.status(500).json({ error: 'Internal role evaluation crash' });
  }
};

const requireAdmin = requireRole(['admin']);
const requireLandlordOrAdmin = requireRole(['landlord', 'admin']);

// ==========================================
// 4. NEXT.JS PREPARATION & APP INITIALIZATION
// ==========================================
nextApp.prepare().then(async () => {
  console.log('📦 Next.js frontend rendering engine compiled.');

  // MONGODB CONNECTION
  if (!MONGODB_URI) {
    console.error('❌ FATAL: MONGODB_URI is not defined in environment variables.');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log(`🍃 MongoDB Connected Successfully to Cluster!`);

  const expressApp = express();
  const server = createServer(expressApp);

  // Global Real Estate Settings Seeding
  await SystemConfig.findOneAndUpdate(
    { key: 'platform_fee_percentage' }, 
    { $setOnInsert: { key: 'platform_fee_percentage', value: 5 } },
    { upsert: true, new: true }
  );
  
  await SystemConfig.findOneAndUpdate(
    { key: 'maintenance_mode' },
    { $setOnInsert: { key: 'maintenance_mode', value: false } },
    { upsert: true, new: true }
  );

  expressApp.use(cors());

  expressApp.use((req, res, next) => {
    if (req.path.startsWith('/api/auth/')) {
      return next();
    }
    express.json()(req, res, (err) => {
      if (err) return next(err);
      express.urlencoded({ extended: true })(req, res, next);
    });
  });

  const io = new SocketIOServer(server, { 
    cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] } 
  });
  
  expressApp.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

  io.on('connection', (socket) => {
    socket.on('joinSystemChannel', (token) => {
      jwt.verify(token, JWT_SECRET, async (err, decoded) => {
        if (!err) {
          if (decoded.role === 'admin') {
            socket.join('admin-dashboard-room');
            console.log(`DEBUG: Admin joined real-time channel. Node ID: ${decoded.id}`);
          }
          socket.join(`user-room-${decoded.id}`);
        }
      });
    });
  });

  // ==========================================
  // 5. AUTHENTICATION (Mobile Number + Password)
  // ==========================================
  expressApp.post('/api/user/signup', async (req, res) => {
    try {
      const { phoneNumber, password, fullName, role } = req.body;
      
      if (!phoneNumber || !password || !fullName) {
        return res.status(400).json({ error: 'All parameters required' });
      }
      
      const existingUser = await User.findOne({ phoneNumber });
      if (existingUser) {
        return res.status(409).json({ error: 'Mobile registration payload matches active record' });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      const assignedRole = role === 'landlord' ? 'landlord' : 'tenant';

      const newUser = await User.create({ phoneNumber, password: hashedPassword, fullName, role: assignedRole });
      
      const token = jwt.sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
      res.status(201).json({ token, user: { id: newUser.id, fullName: newUser.fullName, role: newUser.role } });
    } catch (err) { 
      console.error("Signup Error:", err);
      res.status(500).json({ error: err.message }); 
    }
  });

  expressApp.post('/api/user/login', async (req, res) => {
    try {
      const { phoneNumber, password } = req.body;
      
      const user = await User.findOne({ phoneNumber });
      if (!user || !user.isActive) return res.status(401).json({ error: 'Invalid record entry or disabled account' });

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) return res.status(401).json({ error: 'Invalid record entry' });

      const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      res.json({ token, user: { id: user.id, fullName: user.fullName, role: user.role, phoneNumber: user.phoneNumber } });
    } catch (err) { 
      console.error("Login Error:", err);
      res.status(500).json({ error: err.message }); 
    }
  });

  // ==========================================
  // 6. PUBLIC MARKETPLACE APIs
  // ==========================================
  expressApp.get('/api/properties/marketplace', async (req, res) => {
    try {
      const { propertyType, minPrice, maxPrice, county, search } = req.query;
      let whereCondition = { status: 'approved' };

      if (propertyType) whereCondition.propertyType = propertyType;
      if (county) whereCondition.county = county;
      
      if (search) {
        whereCondition.$or = [
          { title: { $regex: search, $options: 'i' } },
          { city: { $regex: search, $options: 'i' } },
          { address: { $regex: search, $options: 'i' } }
        ];
      }

      const properties = await Property.find(whereCondition).populate({
        path: 'Units',
        match: { isOccupied: false }
      });

      res.json(properties);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==========================================
  // 7. LANDLORD & PROPERTY MANAGER APIs
  // ==========================================
  expressApp.post('/api/landlord/properties', authenticateToken, requireLandlordOrAdmin, async (req, res) => {
    try {
      const payload = {
        ...req.body,
        landlordId: req.user.id,
        status: req.user.role === 'admin' ? 'approved' : 'pending_approval'
      };

      const newProperty = await Property.create(payload);
      
      io.to('admin-dashboard-room').emit('newPropertyAlert', newProperty);

      res.status(201).json(newProperty);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==========================================
  // 8. TENANT APIs (Leases, Rent & Maintenance)
  // ==========================================
  expressApp.get('/api/tenant/my-leases', authenticateToken, async (req, res) => {
    try {
      const leases = await Lease.find({ tenantId: req.user.id })
        .populate({
          path: 'Unit',
          populate: { path: 'Property' }
        })
        .sort({ createdAt: -1 });
      res.json(leases);
    } catch (err) { 
      res.status(500).json({ error: err.message }); 
    }
  });

  expressApp.post('/api/tenant/maintenance', authenticateToken, upload.array('images', 3), async (req, res) => {
    try {
      const { propertyId, unitId, title, description, category, priority } = req.body;
      const imageUrls = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];

      const ticket = await MaintenanceTicket.create({
        tenantId: req.user.id,
        propertyId,
        unitId,
        title,
        description,
        category,
        priority,
        images: imageUrls,
        status: 'open'
      });

      io.to('admin-dashboard-room').emit('newMaintenanceTicket', ticket);
      res.status(201).json(ticket);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==========================================
  // 9. SUPER ADMIN ENGINE
  // ==========================================
  expressApp.post('/api/admin/upload', authenticateToken, requireAdmin, upload.single('image'), (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file buffered to stream' });
      const fileUrl = `/uploads/${req.file.filename}`;
      res.json({ url: fileUrl });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.put('/api/admin/properties/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const property = await Property.findById(req.params.id);
      if (!property) return res.status(404).json({ error: 'Property not found' });
      
      const oldStatus = property.status;
      property.status = req.body.status;
      await property.save();

      await AdminLog.create({
        adminId: req.dbUser.id,
        action: 'UPDATE_PROPERTY_STATUS',
        targetType: 'property',
        targetId: property.id,
        changes: { oldStatus, newStatus: req.body.status },
        ipAddress: req.ip
      });

      io.to(`user-room-${property.landlordId}`).emit('propertyStatusUpdated', property);
      res.json(property);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const systemRegisteredUsers = await User.find().select('-password');
      res.json(systemRegisteredUsers);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.put('/api/admin/users/:id/modify', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const { fullName, role, isActive } = req.body;
      const targetUserRecord = await User.findById(req.params.id);
      if (!targetUserRecord) return res.status(404).json({ error: 'Invalid document' });

      if (fullName !== undefined) targetUserRecord.fullName = fullName;
      if (role !== undefined) targetUserRecord.role = role;
      if (isActive !== undefined) targetUserRecord.isActive = isActive;

      await targetUserRecord.save();
      
      await AdminLog.create({
        adminId: req.dbUser.id,
        action: 'MODIFY_USER_CLEARANCE',
        targetType: 'user',
        targetId: targetUserRecord.id.toString(),
        changes: req.body,
        ipAddress: req.ip
      });

      res.json({ message: 'User updated', record: targetUserRecord });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.get('/api/admin/logs', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const logs = await AdminLog.find()
        .populate('Admin', 'fullName')
        .sort({ createdAt: -1 })
        .limit(150);
      res.json(logs);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==========================================
  // 10. INTERCEPT NEXT.JS ROUTING PARSING OVERRIDES
  // ==========================================
  expressApp.all(/.*/, (req, res) => {
    if (req.path.startsWith('/api/auth/')) {
      return nextHandler(req, res, parse(req.url, true));
    }
    const parsedUrl = parse(req.url, true);
    nextHandler(req, res, parsedUrl);
  });

  server.listen(port, () => {
    console.log(`\n=============================================================`);
    console.log(`🏢 Real Estate & Property Management Engine Is Live`);
    console.log(`📡 Serving API Requests & WebSockets at http://${hostname}:${port}`);
    console.log(`=============================================================\n`);
  });

}).catch((fatalInitCrashErr) => {
  console.error('❌ Root System Initialization Core Failure encountered:', fatalInitCrashErr);
  process.exit(1);
});