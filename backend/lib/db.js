import mongoose from 'mongoose';

// Ensure virtuals (like .id instead of ._id) are included when converting to JSON
const opts = { toJSON: { virtuals: true }, toObject: { virtuals: true } };

// 1. User Schema
const UserSchema = new mongoose.Schema({
  phoneNumber: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  fullName: { type: String, required: true },
  role: { type: String, enum: ['tenant', 'landlord', 'admin'], default: 'tenant' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true, ...opts });

// 2. Property Schema
const PropertySchema = new mongoose.Schema({
  landlordId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  propertyType: { type: String, required: true }, // Apartment, House, Commercial, Villa
  county: { type: String, required: true },
  city: { type: String, required: true },
  address: { type: String, required: true },
  status: { type: String, enum: ['pending_approval', 'approved', 'rejected'], default: 'pending_approval' }
}, { timestamps: true, ...opts });

// Virtual to match frontend expectations (prop.Units)
PropertySchema.virtual('Units', {
  ref: 'Unit',
  localField: '_id',
  foreignField: 'propertyId'
});

// 3. Unit Schema
const UnitSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  unitNumber: { type: String, required: true },
  rentAmount: { type: Number, required: true },
  isOccupied: { type: Boolean, default: false }
}, { timestamps: true, ...opts });

// Virtual for lease.Unit.Property matching
UnitSchema.virtual('Property', {
  ref: 'Property',
  localField: 'propertyId',
  foreignField: '_id',
  justOne: true
});

// 4. Lease Schema
const LeaseSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  rentAmount: { type: Number, required: true }
}, { timestamps: true, ...opts });

// Virtual for frontend expectations (lease.Unit)
LeaseSchema.virtual('Unit', {
  ref: 'Unit',
  localField: 'unitId',
  foreignField: '_id',
  justOne: true
});

// 5. Payment Schema
const PaymentSchema = new mongoose.Schema({
  leaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Lease', required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: 'completed' },
  transactionRef: { type: String }
}, { timestamps: true, ...opts });

// 6. MaintenanceTicket Schema
const MaintenanceTicketSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  propertyId: { type: String, required: true }, // Kept as string to support manual input from your frontend form
  unitId: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, default: 'plumbing' },
  priority: { type: String, default: 'low' },
  images: { type: [String], default: [] },
  status: { type: String, default: 'open' }
}, { timestamps: true, ...opts });

// 7. AdminLog Schema
const AdminLogSchema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: { type: String, required: true },
  targetType: { type: String, required: true },
  targetId: { type: String, required: true },
  changes: { type: mongoose.Schema.Types.Mixed },
  ipAddress: { type: String }
}, { timestamps: true, ...opts });

AdminLogSchema.virtual('Admin', {
  ref: 'User',
  localField: 'adminId',
  foreignField: '_id',
  justOne: true
});

// 8. SystemConfig Schema
const SystemConfigSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true }
}, { timestamps: true, ...opts });

// Export Models
export const User = mongoose.model('User', UserSchema);
export const Property = mongoose.model('Property', PropertySchema);
export const Unit = mongoose.model('Unit', UnitSchema);
export const Lease = mongoose.model('Lease', LeaseSchema);
export const Payment = mongoose.model('Payment', PaymentSchema);
export const MaintenanceTicket = mongoose.model('MaintenanceTicket', MaintenanceTicketSchema);
export const AdminLog = mongoose.model('AdminLog', AdminLogSchema);
export const SystemConfig = mongoose.model('SystemConfig', SystemConfigSchema);