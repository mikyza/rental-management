import dns from 'dns';
dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4', '1.0.0.1']);
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
const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

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
// 2. INLINE DATABASE SCHEMAS & MODELS
// ==========================================
const UserSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  role: { type: String, enum: ['tenant', 'landlord', 'admin'], default: 'tenant' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

const PropertySchema = new mongoose.Schema({
  landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  propertyType: { type: String, required: true }, // e.g., Apartment, Villa, House, Commercial
  county: { type: String, required: true },
  city: { type: String, required: true },
  address: { type: String, required: true },
  status: { type: String, enum: ['pending_approval', 'approved', 'rejected'], default: 'pending_approval' },
  imageUrl: { type: String },
  rating: { type: Number, default: 4.5 },
  ratingCount: { type: Number, default: 1 },
  price: { type: Number, required: true },
  sizeCategory: { type: String, enum: ['single-room', 'bedsitter', 'apartment', 'mansion', 'commercial'], required: true }
}, { timestamps: true });

// Virtual for Units relationship
PropertySchema.virtual('Units', {
  ref: 'Unit',
  localField: '_id',
  foreignField: 'propertyId'
});
PropertySchema.set('toObject', { virtuals: true });
PropertySchema.set('toJSON', { virtuals: true });

const UnitSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  unitNumber: { type: String, required: true },
  rentAmount: { type: Number, required: true },
  isOccupied: { type: Boolean, default: false }
}, { timestamps: true });

const LeaseSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  rentAmount: { type: Number, required: true }
}, { timestamps: true });

const MaintenanceTicketSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property' },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, enum: ['plumbing', 'electrical', 'structural', 'other'], default: 'plumbing' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'low' },
  images: [{ type: String }],
  status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' }
}, { timestamps: true });

// NEW: Request to Buy or Rent Schema
const PropertyRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  requestType: { type: String, enum: ['buy', 'rent'], required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'payment_pending', 'completed'], default: 'pending' },
  offeredAmount: { type: Number, required: true },
  agreementUrl: { type: String }, // For uploaded rent/buy agreements
  adminNotes: { type: String }
}, { timestamps: true });

// NEW: Payment & Transaction Log Schema
const PaymentLogSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'PropertyRequest' },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'completed', 'failed'], default: 'pending' },
  paymentMethod: { type: String, default: 'Bank Transfer/Card' },
  transactionId: { type: String }
}, { timestamps: true });

const AdminLogSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  targetType: { type: String, required: true },
  targetId: { type: String, required: true },
  changes: { type: mongoose.Schema.Types.Mixed },
  ipAddress: { type: String }
}, { timestamps: true });

const SystemConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true });

// Initialize Models
const User = mongoose.models.User || mongoose.model('User', UserSchema);
const Property = mongoose.models.Property || mongoose.model('Property', PropertySchema);
const Unit = mongoose.models.Unit || mongoose.model('Unit', UnitSchema);
const Lease = mongoose.models.Lease || mongoose.model('Lease', LeaseSchema);
const MaintenanceTicket = mongoose.models.MaintenanceTicket || mongoose.model('MaintenanceTicket', MaintenanceTicketSchema);
const PropertyRequest = mongoose.models.PropertyRequest || mongoose.model('PropertyRequest', PropertyRequestSchema);
const PaymentLog = mongoose.models.PaymentLog || mongoose.model('PaymentLog', PaymentLogSchema);
const AdminLog = mongoose.models.AdminLog || mongoose.model('AdminLog', AdminLogSchema);
const SystemConfig = mongoose.models.SystemConfig || mongoose.model('SystemConfig', SystemConfigSchema);


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

  if (!MONGODB_URI) {
    console.error('❌ FATAL: MONGO_URI or MONGODB_URI is not defined in environment variables.');
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10
  });
  console.log(`🍃 MongoDB Connected Successfully to Cluster!`);

  // ==========================================
  // SEEDING: SUPER ADMIN & DEFAULT PROPERTIES
  // ==========================================
  try {
    // 1. Seed Super Admin
    let adminUser = await User.findOne({ phoneNumber: 'admin' });
    const hashedAdminPassword = await bcrypt.hash('0746323229', 12);
    
    if (!adminUser) {
      adminUser = await User.create({
        phoneNumber: 'admin', // Allows logging in with 'admin'
        password: hashedAdminPassword,
        fullName: 'Super Administrator',
        role: 'admin',
        isActive: true
      });
      // Also ensure 0746323229 exists as an admin for flexibility
      await User.findOneAndUpdate(
        { phoneNumber: '0746323229' },
        { password: hashedAdminPassword, fullName: 'Super Administrator', role: 'admin', isActive: true },
        { upsert: true }
      );
      console.log('🛡️ Default Admin accounts seeded (Username: admin OR 0746323229, Password: 0746323229)');
    }

    // 2. Seed Rich Property Data if empty
    const propertyCount = await Property.countDocuments();
    if (propertyCount === 0 && adminUser) {
      console.log('🏠 Database empty. Seeding rich initial property marketplace...');
      const seedProperties = [
        {
          landlordId: adminUser._id, title: 'Executive 5-Bedroom Luxury Mansion', description: 'Ultra-modern mansion featuring high-end finishes, private swimming pool, landscaped garden, and 24/7 security.', propertyType: 'Villa', county: 'Nairobi', city: 'Karen', address: 'Miotoni Road', status: 'approved', imageUrl: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80', rating: 4.9, price: 350000, sizeCategory: 'mansion'
        },
        {
          landlordId: adminUser._id, title: 'Spacious 3-Bedroom Skyline Apartment', description: 'Breathtaking views of the city skyline, modern kitchen appliances, gym, and rooftop terrace access.', propertyType: 'Apartment', county: 'Nairobi', city: 'Westlands', address: 'Mpaka Road', status: 'approved', imageUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=800&q=80', rating: 4.7, price: 120000, sizeCategory: 'apartment'
        },
        {
          landlordId: adminUser._id, title: 'Cosy 2-Bedroom Suburban Home', description: 'Quiet gated community with lush greenery, ample parking, and reliable borehole water supply.', propertyType: 'House', county: 'Kiambu', city: 'Ruiru', address: 'Eastern Bypass', status: 'approved', imageUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80', rating: 4.5, price: 55000, sizeCategory: 'apartment'
        },
        {
          landlordId: adminUser._id, title: 'Modern Bedsitter Studio', description: 'Perfect for young professionals. Fiber internet ready, CCTV surveillance, and prepaid electricity.', propertyType: 'Apartment', county: 'Nairobi', city: 'Kahawa Sukari', address: 'Kenyatta Road', status: 'approved', imageUrl: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80', rating: 4.3, price: 18000, sizeCategory: 'bedsitter'
        },
        {
          landlordId: adminUser._id, title: 'Standard Single Room Rental', description: 'Clean, secure, and affordable single room with shared modern amenities and constant water.', propertyType: 'House', county: 'Nairobi', city: 'Umoja', address: 'Inner Core', status: 'approved', imageUrl: 'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80', rating: 4.1, price: 7500, sizeCategory: 'single-room'
        },
        {
          landlordId: adminUser._id, title: 'Prime Commercial Office Suite', description: 'High foot-traffic commercial building ideal for tech startups, law firms, and consulting agencies.', propertyType: 'Commercial', county: 'Mombasa', city: 'Mombasa CBD', address: 'Nkrumah Road', status: 'approved', imageUrl: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=800&q=80', rating: 4.8, price: 200000, sizeCategory: 'commercial'
        },
        {
          landlordId: adminUser._id, title: 'Luxury 4-Bedroom Beachfront Villa', description: 'Direct beach access, private infinity pool, fully furnished with exquisite coastal interior decor.', propertyType: 'Villa', county: 'Mombasa', city: 'Nyali', address: 'Beach Road', status: 'approved', imageUrl: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=800&q=80', rating: 5.0, price: 400000, sizeCategory: 'mansion'
        },
        {
          landlordId: adminUser._id, title: 'Budget Bedsitter with Balcony', description: 'Secure perimeter wall, large windows for natural lighting, and close to public transport stages.', propertyType: 'Apartment', county: 'Nakuru', city: 'Nakuru CBD', address: 'Kenyatta Avenue', status: 'approved', imageUrl: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80', rating: 4.2, price: 12000, sizeCategory: 'bedsitter'
        }
      ];
      
      const createdProps = await Property.insertMany(seedProperties);
      
      // Create a default unit for each property
      for (const prop of createdProps) {
        await Unit.create({
          propertyId: prop._id,
          unitNumber: '1',
          rentAmount: prop.price,
          isOccupied: false
        });
      }
      console.log('✅ Successfully seeded rich properties and units.');
    }
  } catch (seedErr) {
    console.error('⚠️ Notice: Could not verify/seed defaults:', seedErr.message);
  }

  const expressApp = express();
  const server = createServer(expressApp);

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
  // 5. AUTHENTICATION & USER MANAGEMENT
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
      
      // Supports login via 'admin' text or '0746323229'
      const user = await User.findOne({ $or: [{ phoneNumber }, { phoneNumber: phoneNumber.toLowerCase() }] });
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

  // Edit User Profile Info
  expressApp.put('/api/user/profile', authenticateToken, async (req, res) => {
    try {
      const { fullName, phoneNumber, password } = req.body;
      const updateData = {};
      
      if (fullName) updateData.fullName = fullName;
      if (phoneNumber) updateData.phoneNumber = phoneNumber;
      if (password) updateData.password = await bcrypt.hash(password, 12);

      const updatedUser = await User.findByIdAndUpdate(req.user.id, updateData, { new: true }).select('-password');
      res.json({ message: 'Profile updated successfully', user: updatedUser });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Suspend User Account
  expressApp.put('/api/user/suspend', authenticateToken, async (req, res) => {
    try {
      await User.findByIdAndUpdate(req.user.id, { isActive: false });
      res.json({ message: 'Account successfully suspended. Contact admin to reactivate.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Delete User Account Completely
  expressApp.delete('/api/user/account', authenticateToken, async (req, res) => {
    try {
      await User.findByIdAndDelete(req.user.id);
      res.json({ message: 'Account permanently deleted.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==========================================
  // 6. PUBLIC MARKETPLACE APIs (With Filtering & Sorting)
  // ==========================================
  expressApp.get('/api/properties/marketplace', async (req, res) => {
    try {
      const { propertyType, county, search, sizeCategory, sortBy } = req.query;
      let whereCondition = { status: 'approved' }; // Only show approved to public

      if (propertyType) whereCondition.propertyType = propertyType;
      if (county) whereCondition.county = county;
      if (sizeCategory) whereCondition.sizeCategory = sizeCategory;
      
      if (search) {
        whereCondition.$or = [
          { title: { $regex: search, $options: 'i' } },
          { city: { $regex: search, $options: 'i' } },
          { address: { $regex: search, $options: 'i' } }
        ];
      }

      // Handle Sorting directly from database
      let sortCondition = { createdAt: -1 }; // default
      if (sortBy === 'highest') sortCondition = { price: -1 };
      if (sortBy === 'lowest') sortCondition = { price: 1 };
      if (sortBy === 'rating') sortCondition = { rating: -1 };

      const properties = await Property.find(whereCondition)
        .sort(sortCondition)
        .populate({
          path: 'Units',
          match: { isOccupied: false }
        });

      res.json(properties);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Allow Users to Rate a Property
  expressApp.post('/api/properties/:id/rate', authenticateToken, async (req, res) => {
    try {
      const { rating } = req.body;
      const property = await Property.findById(req.params.id);
      if (!property) return res.status(404).json({ error: 'Property not found' });

      // Basic average calculation (new rating combined with historic average)
      const currentTotal = property.rating * property.ratingCount;
      property.ratingCount += 1;
      property.rating = (currentTotal + Number(rating)) / property.ratingCount;
      
      await property.save();
      res.json({ message: 'Rating submitted successfully', property });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==========================================
  // 7. BUY / RENT REQUESTS (USER TRACKING)
  // ==========================================
  // Create a new request to buy or rent
  expressApp.post('/api/requests', authenticateToken, async (req, res) => {
    try {
      const { propertyId, requestType, offeredAmount } = req.body;
      const newRequest = await PropertyRequest.create({
        userId: req.user.id,
        propertyId,
        requestType, // 'buy' or 'rent'
        offeredAmount,
        status: 'pending'
      });
      
      io.to('admin-dashboard-room').emit('newPropertyRequest', newRequest);
      res.status(201).json({ message: 'Request submitted to admin for approval.', request: newRequest });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Get User's Own Requests for Tracking
  expressApp.get('/api/requests/my-requests', authenticateToken, async (req, res) => {
    try {
      const requests = await PropertyRequest.find({ userId: req.user.id })
        .populate('propertyId')
        .sort({ createdAt: -1 });
      res.json(requests);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // Upload Agreement (PDF/DOC) to a Specific Request
  expressApp.post('/api/requests/:id/agreement', authenticateToken, upload.single('agreement'), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      
      const fileUrl = `/uploads/${req.file.filename}`;
      const request = await PropertyRequest.findByIdAndUpdate(
        req.params.id, 
        { agreementUrl: fileUrl },
        { new: true }
      );
      
      if (!request) return res.status(404).json({ error: 'Request not found' });
      res.json({ message: 'Agreement uploaded successfully', request });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==========================================
  // 8. PAYMENT PLATFORM INTEGRATION
  // ==========================================
  // Initiate payment after a request is approved by admin
  expressApp.post('/api/payments/initiate', authenticateToken, async (req, res) => {
    try {
      const { requestId, amount, paymentMethod } = req.body;
      
      const request = await PropertyRequest.findById(requestId);
      if (!request || !['approved', 'payment_pending'].includes(request.status)) {
        return res.status(400).json({ error: 'Request must be approved by admin before payment' });
      }

      // Create a pending payment log
      const paymentLog = await PaymentLog.create({
        userId: req.user.id,
        requestId,
        amount,
        paymentMethod: paymentMethod || 'Card/Bank',
        status: 'pending',
        transactionId: 'TXN-' + Math.random().toString(36).substr(2, 9).toUpperCase()
      });

      // Update request status to reflect payment is in progress
      request.status = 'payment_pending';
      await request.save();

      // Return a professional mock-checkout structure for the frontend to render the payment gateway
      res.json({ 
        message: 'Payment platform initialized.', 
        transactionId: paymentLog.transactionId,
        checkoutUrl: `/payment-gateway?txn=${paymentLog.transactionId}`, // Frontend will handle this view
        paymentLog 
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==========================================
  // 9. LANDLORD & PROPERTY MANAGER APIs
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
  // 10. TENANT APIs
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
  // 11. SUPER ADMIN ENGINE (Full CRUD)
  // ==========================================
  
  // -- Admin Buy/Rent Requests Management --
  expressApp.get('/api/admin/requests', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const requests = await PropertyRequest.find()
        .populate('userId', 'fullName phoneNumber')
        .populate('propertyId', 'title price')
        .sort({ createdAt: -1 });
      res.json(requests);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.put('/api/admin/requests/:id/status', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const { status, adminNotes } = req.body;
      const request = await PropertyRequest.findByIdAndUpdate(
        req.params.id, 
        { status, adminNotes },
        { new: true }
      );
      if (!request) return res.status(404).json({ error: 'Request not found' });
      
      // Emit to user room that their request status changed
      io.to(`user-room-${request.userId}`).emit('requestStatusUpdate', request);
      res.json({ message: 'Request status updated successfully', request });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // -- Admin View Payment Logs --
  expressApp.get('/api/admin/payments', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const payments = await PaymentLog.find()
        .populate('userId', 'fullName')
        .populate('requestId')
        .sort({ createdAt: -1 });
      res.json(payments);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // -- Admin Properties (Can edit landlord info here) --
  expressApp.get('/api/admin/properties', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const properties = await Property.find().populate('landlordId', 'fullName').sort({ createdAt: -1 });
      res.json(properties);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.post('/api/admin/properties', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const newProperty = await Property.create({
        ...req.body,
        landlordId: req.body.landlordId || req.user.id,
        status: req.body.status || 'approved'
      });
      await AdminLog.create({
        adminId: req.dbUser.id,
        action: 'CREATE_PROPERTY',
        targetType: 'property',
        targetId: newProperty.id,
        ipAddress: req.ip
      });
      res.status(201).json(newProperty);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.put('/api/admin/properties/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const updated = await Property.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updated) return res.status(404).json({ error: 'Property not found' });
      await AdminLog.create({
        adminId: req.dbUser.id,
        action: 'UPDATE_PROPERTY',
        targetType: 'property',
        targetId: updated.id,
        ipAddress: req.ip
      });
      res.json(updated);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.delete('/api/admin/properties/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const deleted = await Property.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Property not found' });
      await Unit.deleteMany({ propertyId: req.params.id }); // Clean up associated units
      await AdminLog.create({
        adminId: req.dbUser.id,
        action: 'DELETE_PROPERTY',
        targetType: 'property',
        targetId: req.params.id,
        ipAddress: req.ip
      });
      res.json({ message: 'Property deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // -- Admin Units --
  expressApp.get('/api/admin/units', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const units = await Unit.find().populate('Property');
      res.json(units);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.post('/api/admin/units', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const newUnit = await Unit.create(req.body);
      res.status(201).json(newUnit);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.put('/api/admin/units/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const updated = await Unit.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updated) return res.status(404).json({ error: 'Unit not found' });
      res.json(updated);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.delete('/api/admin/units/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const deleted = await Unit.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Unit not found' });
      res.json({ message: 'Unit deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // -- Admin Leases --
  expressApp.get('/api/admin/leases', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const leases = await Lease.find().populate('tenantId Unit');
      res.json(leases);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.post('/api/admin/leases', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const newLease = await Lease.create(req.body);
      // Mark unit as occupied
      await Unit.findByIdAndUpdate(req.body.unitId, { isOccupied: true });
      res.status(201).json(newLease);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.put('/api/admin/leases/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const updated = await Lease.findByIdAndUpdate(req.params.id, req.body, { new: true });
      if (!updated) return res.status(404).json({ error: 'Lease not found' });
      res.json(updated);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.delete('/api/admin/leases/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const deleted = await Lease.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'Lease not found' });
      // Free up the unit upon lease deletion
      if (deleted.unitId) {
        await Unit.findByIdAndUpdate(deleted.unitId, { isOccupied: false });
      }
      res.json({ message: 'Lease deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // -- Admin Users --
  expressApp.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const users = await User.find().select('-password');
      res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.put('/api/admin/users/:id/modify', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const { fullName, role, isActive } = req.body;
      const targetUser = await User.findById(req.params.id);
      if (!targetUser) return res.status(404).json({ error: 'User not found' });

      if (fullName !== undefined) targetUser.fullName = fullName;
      if (role !== undefined) targetUser.role = role;
      if (isActive !== undefined) targetUser.isActive = isActive;

      await targetUser.save();
      res.json({ message: 'User updated successfully', record: targetUser });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  expressApp.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const deleted = await User.findByIdAndDelete(req.params.id);
      if (!deleted) return res.status(404).json({ error: 'User not found' });
      res.json({ message: 'User deleted successfully' });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // -- Admin Logs --
  expressApp.get('/api/admin/logs', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const logs = await AdminLog.find().sort({ createdAt: -1 }).limit(150);
      res.json(logs);
    } catch (err) { res.status(500).json({ error: err.message }); }
  });

  // ==========================================
  // 12. NEXT.JS ROUTING ROUTER
  // ==========================================
  expressApp.all(/.*/, (req, res) => {
    const parsedUrl = parse(req.url, true);
    nextHandler(req, res, parsedUrl);
  });

  server.listen(port, () => {
    console.log(`\n=============================================================`);
    console.log(`🏢 Real Estate & Property Management Engine Is Live`);
    console.log(`📡 Serving API Requests & WebSockets at http://${hostname}:${port}`);
    console.log(`============================================================-\n`);
  });

}).catch((fatalInitCrashErr) => {
  console.error('❌ Root System Initialization Core Failure encountered:', fatalInitCrashErr);
  process.exit(1);
});
