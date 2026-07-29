'use client';

import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Building,
  Home,
  ShieldCheck,
  Wrench,
  User,
  Phone,
  Lock,
  Plus,
  CheckCircle,
  XCircle,
  Search,
  Bell,
  LogOut,
  Filter,
  Upload,
  Activity,
  FileText,
  RefreshCw,
  AlertCircle,
  Users,
  ChevronRight,
  Eye,
  Tag
} from 'lucide-react';

// ==========================================
// TYPES & INTERFACES
// ==========================================
interface UserProfile {
  id: number;
  fullName: string;
  phoneNumber: string;
  role: 'tenant' | 'landlord' | 'admin';
}

interface Unit {
  id: number;
  unitNumber: string;
  rentAmount: number;
  isOccupied: boolean;
}

interface Property {
  id: number;
  landlordId: number;
  title: string;
  description: string;
  propertyType: string;
  county: string;
  city: string;
  address: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  Units?: Unit[];
  createdAt?: string;
}

interface Lease {
  id: number;
  tenantId: number;
  unitId: number;
  startDate: string;
  endDate: string;
  rentAmount: number;
  Unit?: Unit & { Property?: Property };
}

interface AdminLog {
  id: number;
  action: string;
  targetType: string;
  targetId: number;
  changes: any;
  ipAddress: string;
  createdAt: string;
  Admin?: { fullName: string };
}

// ==========================================
// MAIN COMPONENT
// ==========================================
export default function PropertyManagementApp() {
  // Auth State
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);

  // Active Navigation Tab
  const [activeTab, setActiveTab] = useState<'marketplace' | 'tenant' | 'landlord' | 'admin' | 'auth'>('marketplace');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  // Real-time Sockets
  const socketRef = useRef<Socket | null>(null);
  const [notifications, setNotifications] = useState<Array<{ id: number; text: string; type: string }>>([]);

  // Form States - Auth
  const [phoneInput, setPhoneInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [fullNameInput, setFullNameInput] = useState('');
  const [roleInput, setRoleInput] = useState<'tenant' | 'landlord'>('tenant');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Data States
  const [marketplaceProperties, setMarketplaceProperties] = useState<Property[]>([]);
  const [loadingMarketplace, setLoadingMarketplace] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [countyFilter, setCountyFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  // Tenant State
  const [myLeases, setMyLeases] = useState<Lease[]>([]);
  const [maintenanceForm, setMaintenanceForm] = useState({
    propertyId: '',
    unitId: '',
    title: '',
    description: '',
    category: 'plumbing',
    priority: 'low'
  });
  const [maintenanceFiles, setMaintenanceFiles] = useState<FileList | null>(null);

  // Landlord State
  const [showAddPropertyModal, setShowAddPropertyModal] = useState(false);
  const [newProperty, setNewProperty] = useState({
    title: '',
    description: '',
    propertyType: 'Apartment',
    county: 'Nairobi',
    city: '',
    address: ''
  });

  // Admin State
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);
  const [pendingProperties, setPendingProperties] = useState<Property[]>([]);

  // Toast Banner
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ==========================================
  // INITIALIZATION & SOCKET SETUP
  // ==========================================
  useEffect(() => {
    // Restore session from localStorage
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');

    if (savedToken && savedUser) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.clear();
      }
    }

    fetchMarketplace();
  }, []);

  useEffect(() => {
    if (!token || !user) return;

    // Connect Socket.io client to current host
    const socket = io(typeof window !== 'undefined' ? window.location.origin : '', {
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('joinSystemChannel', token);
    });

    // Real-time Event Listeners
    socket.on('newPropertyAlert', (property: Property) => {
      showToast(`⚡ New property pending approval: ${property.title}`, 'info');
      if (user.role === 'admin') fetchAdminData();
    });

    socket.on('newMaintenanceTicket', (ticket: any) => {
      showToast(`🔧 New maintenance ticket opened: #${ticket.id} (${ticket.priority.toUpperCase()})`, 'info');
    });

    socket.on('propertyStatusUpdated', (property: Property) => {
      showToast(`🏠 Your property "${property.title}" status changed to: ${property.status.toUpperCase()}`, 'success');
    });

    return () => {
      socket.disconnect();
    };
  }, [token, user]);

  // Refresh view data when switching tabs
  useEffect(() => {
    if (activeTab === 'marketplace') fetchMarketplace();
    if (activeTab === 'tenant' && token) fetchTenantLeases();
    if (activeTab === 'admin' && token && user?.role === 'admin') fetchAdminData();
  }, [activeTab, token, user]);

  // ==========================================
  // API CALLS
  // ==========================================
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    const endpoint = authMode === 'login' ? '/api/user/login' : '/api/user/signup';
    const payload =
      authMode === 'login'
        ? { phoneNumber: phoneInput, password: passwordInput }
        : { phoneNumber: phoneInput, password: passwordInput, fullName: fullNameInput, role: roleInput };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      setToken(data.token);
      setUser(data.user);
      showToast(`Welcome back, ${data.user.fullName}!`, 'success');

      // Auto route based on role
      if (data.user.role === 'admin') setActiveTab('admin');
      else if (data.user.role === 'landlord') setActiveTab('landlord');
      else setActiveTab('tenant');
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    setActiveTab('marketplace');
    showToast('Logged out successfully', 'info');
  };

  const fetchMarketplace = async () => {
    setLoadingMarketplace(true);
    try {
      const queryParams = new URLSearchParams();
      if (searchQuery) queryParams.append('search', searchQuery);
      if (countyFilter) queryParams.append('county', countyFilter);
      if (typeFilter) queryParams.append('propertyType', typeFilter);

      const res = await fetch(`/api/properties/marketplace?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMarketplaceProperties(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMarketplace(false);
    }
  };

  const fetchTenantLeases = async () => {
    try {
      const res = await fetch('/api/tenant/my-leases', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMyLeases(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleMaintenanceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      const formData = new FormData();
      formData.append('propertyId', maintenanceForm.propertyId);
      formData.append('unitId', maintenanceForm.unitId);
      formData.append('title', maintenanceForm.title);
      formData.append('description', maintenanceForm.description);
      formData.append('category', maintenanceForm.category);
      formData.append('priority', maintenanceForm.priority);

      if (maintenanceFiles) {
        Array.from(maintenanceFiles).forEach((file) => formData.append('images', file));
      }

      const res = await fetch('/api/tenant/maintenance', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      if (res.ok) {
        showToast('Maintenance request logged successfully!', 'success');
        setMaintenanceForm({ propertyId: '', unitId: '', title: '', description: '', category: 'plumbing', priority: 'low' });
        setMaintenanceFiles(null);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to submit ticket', 'error');
      }
    } catch (e) {
      showToast('Network error while submitting ticket', 'error');
    }
  };

  const handleAddProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    try {
      const res = await fetch('/api/landlord/properties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(newProperty)
      });

      if (res.ok) {
        showToast('Property created successfully! Awaiting approval.', 'success');
        setShowAddPropertyModal(false);
        setNewProperty({ title: '', description: '', propertyType: 'Apartment', county: 'Nairobi', city: '', address: '' });
      } else {
        const err = await res.json();
        showToast(err.error || 'Error creating property', 'error');
      }
    } catch (e) {
      showToast('Failed to connect to backend', 'error');
    }
  };

  const fetchAdminData = async () => {
    if (!token) return;
    try {
      const [usersRes, logsRes] = await Promise.all([
        fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/logs', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (usersRes.ok) setAdminUsers(await usersRes.json());
      if (logsRes.ok) setAdminLogs(await logsRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  const updatePropertyStatus = async (propertyId: number, newStatus: 'approved' | 'rejected') => {
    try {
      const res = await fetch(`/api/admin/properties/${propertyId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (res.ok) {
        showToast(`Property status updated to ${newStatus}`, 'success');
        fetchMarketplace();
      }
    } catch (e) {
      showToast('Failed to update status', 'error');
    }
  };

  // ==========================================
  // RENDER UI
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Toast Notification Banner */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-xl text-white font-medium transition-all transform animate-bounce ${
            toast.type === 'success'
              ? 'bg-emerald-600'
              : toast.type === 'error'
              ? 'bg-red-600'
              : 'bg-slate-800'
          }`}
        >
          <Bell className="w-5 h-5" />
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header & Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-lg border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('marketplace')}>
            <div className="p-2 bg-emerald-500 rounded-lg text-slate-950 font-bold">
              <Building className="w-6 h-6" />
            </div>
            <div>
              <span className="font-extrabold text-xl tracking-wide bg-gradient-to-r from-white via-slate-200 to-emerald-400 bg-clip-text text-transparent">
                PropTech Hub
              </span>
              <span className="hidden sm:inline-block ml-2 text-xs text-emerald-400 font-semibold px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800">
                Live Server
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => setActiveTab('marketplace')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'marketplace' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Home className="w-4 h-4" />
              <span className="hidden md:inline">Marketplace</span>
            </button>

            {user?.role === 'tenant' && (
              <button
                onClick={() => setActiveTab('tenant')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'tenant' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <User className="w-4 h-4" />
                <span className="hidden md:inline">Tenant Portal</span>
              </button>
            )}

            {(user?.role === 'landlord' || user?.role === 'admin') && (
              <button
                onClick={() => setActiveTab('landlord')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'landlord' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Building className="w-4 h-4" />
                <span className="hidden md:inline">Landlord Portal</span>
              </button>
            )}

            {user?.role === 'admin' && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'admin' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span className="hidden md:inline">Super Admin</span>
              </button>
            )}

            {/* Auth Buttons */}
            {user ? (
              <div className="flex items-center gap-3 pl-2 border-l border-slate-700">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-semibold text-slate-200">{user.fullName}</p>
                  <p className="text-[10px] text-emerald-400 capitalize">{user.role}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
                  title="Log Out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setActiveTab('auth')}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-sm transition-colors"
              >
                <Lock className="w-4 h-4" />
                <span>Sign In</span>
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* ========================================== */}
        {/* TAB 1: PUBLIC MARKETPLACE                  */}
        {/* ========================================== */}
        {activeTab === 'marketplace' && (
          <div className="space-y-8">
            {/* Hero Section */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-8 sm:p-12 text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 -mt-12 -mr-12 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
              <div className="max-w-2xl relative z-10 space-y-4">
                <span className="inline-block px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold rounded-full uppercase tracking-wider">
                  Verified Real Estate & Housing
                </span>
                <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
                  Find Your Perfect Rental Space Today.
                </h1>
                <p className="text-slate-300 text-base sm:text-lg">
                  Direct mobile booking, transparent leases, and instant support.
                </p>
              </div>

              {/* Search Bar */}
              <div className="mt-8 bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by title or city..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-800/80 text-white rounded-xl text-sm border border-slate-700 focus:outline-none focus:border-emerald-500 placeholder-slate-400"
                  />
                </div>

                <div>
                  <select
                    value={countyFilter}
                    onChange={(e) => setCountyFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-800/80 text-white rounded-xl text-sm border border-slate-700 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">All Counties</option>
                    <option value="Nairobi">Nairobi</option>
                    <option value="Kiambu">Kiambu</option>
                    <option value="Mombasa">Mombasa</option>
                    <option value="Nakuru">Nakuru</option>
                  </select>
                </div>

                <div>
                  <select
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-800/80 text-white rounded-xl text-sm border border-slate-700 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">All Types</option>
                    <option value="Apartment">Apartment</option>
                    <option value="House">House</option>
                    <option value="Commercial">Commercial</option>
                    <option value="Villa">Villa</option>
                  </select>
                </div>

                <button
                  onClick={fetchMarketplace}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
                >
                  <Filter className="w-4 h-4" />
                  Filter Listings
                </button>
              </div>
            </div>

            {/* Grid Title */}
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-slate-900">Available Properties</h2>
              <button
                onClick={fetchMarketplace}
                className="flex items-center gap-1.5 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
              >
                <RefreshCw className="w-4 h-4" /> Refresh
              </button>
            </div>

            {/* Properties Grid */}
            {loadingMarketplace ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="bg-white rounded-2xl h-80 p-4 border border-slate-200 animate-pulse space-y-4">
                    <div className="bg-slate-200 h-40 rounded-xl" />
                    <div className="h-6 bg-slate-200 rounded w-3/4" />
                    <div className="h-4 bg-slate-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : marketplaceProperties.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border border-slate-200 space-y-3">
                <AlertCircle className="w-12 h-12 text-slate-400 mx-auto" />
                <h3 className="text-lg font-bold text-slate-700">No properties found</h3>
                <p className="text-sm text-slate-500">Try adjusting your filters or check back later.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {marketplaceProperties.map((prop) => (
                  <div
                    key={prop.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      <div className="relative h-48 bg-slate-800 flex items-center justify-center text-slate-500">
                        <Building className="w-16 h-16 opacity-40" />
                        <span className="absolute top-3 left-3 bg-emerald-500 text-slate-950 font-bold text-xs px-2.5 py-1 rounded-full uppercase tracking-wider">
                          {prop.propertyType}
                        </span>
                        <span className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-md text-white text-xs px-2.5 py-1 rounded-full">
                          {prop.county}
                        </span>
                      </div>
                      <div className="p-5 space-y-2">
                        <h3 className="font-bold text-lg text-slate-900 leading-snug">{prop.title}</h3>
                        <p className="text-sm text-slate-500 line-clamp-2">{prop.description}</p>
                        <div className="text-xs font-semibold text-slate-600 bg-slate-100 p-2 rounded-lg">
                          📍 {prop.address}, {prop.city}
                        </div>
                      </div>
                    </div>

                    <div className="p-5 pt-0 border-t border-slate-100 flex items-center justify-between mt-4">
                      <div>
                        <span className="text-xs text-slate-400 block">Available Units</span>
                        <span className="font-bold text-slate-800 text-sm">
                          {prop.Units ? prop.Units.filter((u) => !u.isOccupied).length : 0} Vacant
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          if (!user) {
                            setActiveTab('auth');
                            showToast('Please login to apply for units', 'info');
                          } else {
                            showToast(`Selected ${prop.title}. Contact landlord to initiate lease.`, 'info');
                          }
                        }}
                        className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1 transition-colors"
                      >
                        Inquire Unit <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 2: TENANT DASHBOARD                    */}
        {/* ========================================== */}
        {activeTab === 'tenant' && user?.role === 'tenant' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Tenant Dashboard</h1>
                <p className="text-sm text-slate-500">Manage your active leases and maintenance requests.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Leases Column */}
              <div className="lg:col-span-2 space-y-6">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-emerald-600" /> Active Leases
                </h2>

                {myLeases.length === 0 ? (
                  <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-2">
                    <Home className="w-10 h-10 text-slate-300 mx-auto" />
                    <p className="text-slate-600 font-medium">No active leases found.</p>
                    <p className="text-xs text-slate-400">Apply for a unit in the marketplace to get started.</p>
                  </div>
                ) : (
                  myLeases.map((lease) => (
                    <div key={lease.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md uppercase">
                            Lease Active
                          </span>
                          <h3 className="text-xl font-bold text-slate-900 mt-2">
                            Unit {lease.Unit?.unitNumber} - {lease.Unit?.Property?.title}
                          </h3>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-400">Monthly Rent</p>
                          <p className="text-xl font-extrabold text-slate-900">
                            KES {lease.rentAmount?.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-slate-400 block">Start Date</span>
                          <span className="font-semibold text-slate-700">{lease.startDate || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">End Date</span>
                          <span className="font-semibold text-slate-700">{lease.endDate || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Maintenance Request Form Column */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Wrench className="w-5 h-5 text-emerald-600" /> Request Maintenance
                </h2>

                <form onSubmit={handleMaintenanceSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Property ID / Unit</label>
                    <input
                      type="number"
                      required
                      placeholder="e.g. Property ID 1"
                      value={maintenanceForm.propertyId}
                      onChange={(e) => setMaintenanceForm({ ...maintenanceForm, propertyId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
                      <select
                        value={maintenanceForm.category}
                        onChange={(e) => setMaintenanceForm({ ...maintenanceForm, category: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                      >
                        <option value="plumbing">Plumbing</option>
                        <option value="electrical">Electrical</option>
                        <option value="structural">Structural</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Priority</label>
                      <select
                        value={maintenanceForm.priority}
                        onChange={(e) => setMaintenanceForm({ ...maintenanceForm, priority: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Issue Title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Leaking bathroom pipe"
                      value={maintenanceForm.title}
                      onChange={(e) => setMaintenanceForm({ ...maintenanceForm, title: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Detailed Description</label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Describe the issue in detail..."
                      value={maintenanceForm.description}
                      onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Attach Photos (Up to 3)</label>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => setMaintenanceFiles(e.target.files)}
                      className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition-colors"
                  >
                    <Upload className="w-4 h-4" /> Submit Maintenance Ticket
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 3: LANDLORD DASHBOARD                  */}
        {/* ========================================== */}
        {activeTab === 'landlord' && (user?.role === 'landlord' || user?.role === 'admin') && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Landlord Portal</h1>
                <p className="text-sm text-slate-500">Add and manage your registered properties.</p>
              </div>

              <button
                onClick={() => setShowAddPropertyModal(true)}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" /> Register New Property
              </button>
            </div>

            {/* Properties List */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 font-bold text-slate-800">My Registered Listings</div>

              <div className="divide-y divide-slate-100">
                {marketplaceProperties.length === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-sm">No properties registered yet.</div>
                ) : (
                  marketplaceProperties.map((p) => (
                    <div key={p.id} className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-lg">{p.title}</h3>
                          <span
                            className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase ${
                              p.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800'
                                : p.status === 'rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {p.status}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {p.propertyType} • {p.address}, {p.city} ({p.county})
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
                          Units: {p.Units ? p.Units.length : 0}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Modal: Add Property */}
            {showAddPropertyModal && (
              <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white max-w-lg w-full rounded-2xl p-6 shadow-2xl space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <h3 className="font-bold text-lg text-slate-900">Add New Property Listing</h3>
                    <button onClick={() => setShowAddPropertyModal(false)} className="text-slate-400 hover:text-slate-600">
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={handleAddProperty} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Property Title</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Royal Palms Apartment"
                        value={newProperty.title}
                        onChange={(e) => setNewProperty({ ...newProperty, title: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Property Type</label>
                        <select
                          value={newProperty.propertyType}
                          onChange={(e) => setNewProperty({ ...newProperty, propertyType: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                        >
                          <option value="Apartment">Apartment</option>
                          <option value="House">House</option>
                          <option value="Commercial">Commercial</option>
                          <option value="Villa">Villa</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">County</label>
                        <input
                          type="text"
                          required
                          value={newProperty.county}
                          onChange={(e) => setNewProperty({ ...newProperty, county: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">City</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Westlands"
                          value={newProperty.city}
                          onChange={(e) => setNewProperty({ ...newProperty, city: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-600 mb-1">Physical Address</label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Ring Road St 4"
                          value={newProperty.address}
                          onChange={(e) => setNewProperty({ ...newProperty, address: e.target.value })}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
                      <textarea
                        rows={3}
                        required
                        placeholder="Provide details on features..."
                        value={newProperty.description}
                        onChange={(e) => setNewProperty({ ...newProperty, description: e.target.value })}
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-xl text-sm transition-colors"
                    >
                      Submit Property
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 4: SUPER ADMIN CONTROL CENTER          */}
        {/* ========================================== */}
        {activeTab === 'admin' && user?.role === 'admin' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Super Admin Control Center</h1>
                <p className="text-sm text-slate-500">System moderation, user clearance, and audit trails.</p>
              </div>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-semibold">Total System Users</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{adminUsers.length}</p>
                </div>
                <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                  <Users className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-semibold">Total Properties</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{marketplaceProperties.length}</p>
                </div>
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
                  <Building className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-400 font-semibold">Audit Logs Count</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{adminLogs.length}</p>
                </div>
                <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
                  <Activity className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Moderation Queue */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 font-bold text-slate-800">Property Moderation Queue</div>
              <div className="divide-y divide-slate-100">
                {marketplaceProperties.filter((p) => p.status === 'pending_approval').length === 0 ? (
                  <div className="p-6 text-center text-slate-400 text-sm">No pending property approvals.</div>
                ) : (
                  marketplaceProperties
                    .filter((p) => p.status === 'pending_approval')
                    .map((p) => (
                      <div key={p.id} className="p-4 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-slate-900">{p.title}</p>
                          <p className="text-xs text-slate-500">
                            {p.city}, {p.county} • Landlord ID: {p.landlordId}
                          </p>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => updatePropertyStatus(p.id, 'approved')}
                            className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg"
                          >
                            <CheckCircle className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button
                            onClick={() => updatePropertyStatus(p.id, 'rejected')}
                            className="flex items-center gap-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </div>

            {/* Audit Logs */}
            <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-xl space-y-4">
              <h3 className="font-bold text-lg text-emerald-400 flex items-center gap-2">
                <Activity className="w-5 h-5" /> Live Admin Audit Log Stream
              </h3>

              <div className="space-y-2 max-h-60 overflow-y-auto font-mono text-xs">
                {adminLogs.map((log) => (
                  <div key={log.id} className="p-2.5 bg-slate-800/80 rounded-lg border border-slate-700 flex justify-between">
                    <span>
                      <strong className="text-emerald-400">[{log.action}]</strong> Target: {log.targetType} #{log.targetId}
                    </span>
                    <span className="text-slate-400">{new Date(log.createdAt).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 5: AUTHENTICATION SCREEN               */}
        {/* ========================================== */}
        {activeTab === 'auth' && (
          <div className="max-w-md mx-auto my-12 bg-white rounded-3xl border border-slate-200 p-8 shadow-xl space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 bg-emerald-500/10 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900">
                {authMode === 'login' ? 'Sign In to Account' : 'Create New Account'}
              </h2>
              <p className="text-xs text-slate-500">Authenticate using mobile phone number</p>
            </div>

            {authError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Jane Doe"
                      value={fullNameInput}
                      onChange={(e) => setFullNameInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Account Role</label>
                    <select
                      value={roleInput}
                      onChange={(e: any) => setRoleInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                    >
                      <option value="tenant">Tenant</option>
                      <option value="landlord">Landlord</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Mobile Phone Number</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="07XXXXXXXX or +254..."
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
              >
                {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : authMode === 'login' ? 'Sign In' : 'Register'}
              </button>
            </form>

            <div className="text-center pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                className="text-xs text-emerald-600 hover:underline font-semibold"
              >
                {authMode === 'login' ? "Don't have an account? Sign Up" : 'Already registered? Sign In'}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}