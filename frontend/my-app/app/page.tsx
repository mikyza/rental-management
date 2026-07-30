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
  Trash2,
  Edit,
  Menu,
  X,
  Layers,
  Key,
  DollarSign
} from 'lucide-react';

// ==========================================
// TYPES & INTERFACES
// ==========================================
interface UserProfile {
  id: string | number;
  fullName: string;
  phoneNumber: string;
  role: 'tenant' | 'landlord' | 'admin';
  isActive?: boolean;
}

interface Unit {
  id: string | number;
  propertyId?: string | number;
  unitNumber: string;
  rentAmount: number;
  isOccupied: boolean;
  Property?: Property;
}

interface Property {
  id: string | number;
  landlordId: string | number;
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
  id: string | number;
  tenantId: string | number;
  unitId: string | number;
  startDate: string;
  endDate: string;
  rentAmount: number;
  Unit?: Unit & { Property?: Property };
  tenantIdRef?: UserProfile;
}

interface AdminLog {
  id: string | number;
  action: string;
  targetType: string;
  targetId: string | number;
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

  // Active Navigation Tab & Mobile Drawer
  const [activeTab, setActiveTab] = useState<'marketplace' | 'tenant' | 'landlord' | 'admin' | 'auth'>('marketplace');
  const [adminSubTab, setAdminSubTab] = useState<'properties' | 'units' | 'leases' | 'users' | 'logs'>('properties');
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sockets & Notifications
  const socketRef = useRef<Socket | null>(null);

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

  // Admin Data States
  const [adminProperties, setAdminProperties] = useState<Property[]>([]);
  const [adminUnits, setAdminUnits] = useState<Unit[]>([]);
  const [adminLeases, setAdminLeases] = useState<Lease[]>([]);
  const [adminUsers, setAdminUsers] = useState<UserProfile[]>([]);
  const [adminLogs, setAdminLogs] = useState<AdminLog[]>([]);

  // Admin Modal States (Add/Edit/Delete)
  const [propertyModal, setPropertyModal] = useState<{ open: boolean; editData?: Property | null }>({ open: false });
  const [unitModal, setUnitModal] = useState<{ open: boolean; editData?: Unit | null }>({ open: false });
  const [leaseModal, setLeaseModal] = useState<{ open: boolean; editData?: Lease | null }>({ open: false });
  const [userModal, setUserModal] = useState<{ open: boolean; editData?: UserProfile | null }>({ open: false });

  // Modal Input Forms
  const [propertyForm, setPropertyForm] = useState({ title: '', description: '', propertyType: 'Apartment', county: 'Nairobi', city: '', address: '', status: 'approved' });
  const [unitForm, setUnitForm] = useState({ propertyId: '', unitNumber: '', rentAmount: '', isOccupied: false });
  const [leaseForm, setLeaseForm] = useState({ tenantId: '', unitId: '', startDate: '', endDate: '', rentAmount: '' });
  const [userForm, setUserForm] = useState({ fullName: '', role: 'tenant', isActive: true });

  // Toast Banner
  const [toast, setToast] = useState<{ message: string; type: 'info' | 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Safe fetch helper to eliminate Uncaught (in promise) errors
  const safeFetch = async (url: string, options?: RequestInit) => {
    try {
      const res = await fetch(url, options);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || `Request failed with status code ${res.status}`);
      }
      return data;
    } catch (err: any) {
      throw new Error(err.message || 'Network request failed');
    }
  };

  // ==========================================
  // INITIALIZATION & SOCKET SETUP
  // ==========================================
  useEffect(() => {
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

    const socket = io(typeof window !== 'undefined' ? window.location.origin : '', {
      transports: ['websocket', 'polling']
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('joinSystemChannel', token);
    });

    socket.on('newPropertyAlert', (property: Property) => {
      showToast(`⚡ New property pending approval: ${property.title}`, 'info');
      if (user.role === 'admin') fetchAdminAll();
    });

    socket.on('newMaintenanceTicket', (ticket: any) => {
      showToast(`🔧 New maintenance ticket opened: #${ticket.id || ''}`, 'info');
    });

    socket.on('propertyStatusUpdated', (property: Property) => {
      showToast(`🏠 Property "${property.title}" status changed to: ${property.status.toUpperCase()}`, 'success');
      fetchMarketplace();
    });

    return () => {
      socket.disconnect();
    };
  }, [token, user]);

  useEffect(() => {
    if (activeTab === 'marketplace') fetchMarketplace();
    if (activeTab === 'tenant' && token) fetchTenantLeases();
    if (activeTab === 'admin' && token && user?.role === 'admin') fetchAdminAll();
    if (activeTab === 'landlord' && token) fetchMarketplace();
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
      const data = await safeFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      setToken(data.token);
      setUser(data.user);
      showToast(`Welcome back, ${data.user.fullName}!`, 'success');

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

      const data = await safeFetch(`/api/properties/marketplace?${queryParams.toString()}`);
      setMarketplaceProperties(data || []);
    } catch (e: any) {
      console.error(e.message);
    } font: null; finally {
      setLoadingMarketplace(false);
    }
  };

  const fetchTenantLeases = async () => {
    try {
      const data = await safeFetch('/api/tenant/my-leases', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMyLeases(data || []);
    } catch (e: any) {
      console.error(e.message);
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

      await safeFetch('/api/tenant/maintenance', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });

      showToast('Maintenance request logged successfully!', 'success');
      setMaintenanceForm({ propertyId: '', unitId: '', title: '', description: '', category: 'plumbing', priority: 'low' });
      setMaintenanceFiles(null);
    } catch (e: any) {
      showToast(e.message || 'Failed to submit ticket', 'error');
    }
  };

  // ==========================================
  // SUPER ADMIN CRUD ENGINE
  // ==========================================
  const fetchAdminAll = async () => {
    if (!token) return;
    try {
      const [props, units, leases, users, logs] = await Promise.all([
        safeFetch('/api/admin/properties', { headers: { Authorization: `Bearer ${token}` } }).catch(() => []),
        safeFetch('/api/admin/units', { headers: { Authorization: `Bearer ${token}` } }).catch(() => []),
        safeFetch('/api/admin/leases', { headers: { Authorization: `Bearer ${token}` } }).catch(() => []),
        safeFetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } }).catch(() => []),
        safeFetch('/api/admin/logs', { headers: { Authorization: `Bearer ${token}` } }).catch(() => [])
      ]);

      setAdminProperties(props || []);
      setAdminUnits(units || []);
      setAdminLeases(leases || []);
      setAdminUsers(users || []);
      setAdminLogs(logs || []);
    } catch (e: any) {
      console.error('Admin sync error:', e.message);
    }
  };

  // Property CRUD
  const saveProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const isEdit = !!propertyModal.editData;
      const url = isEdit ? `/api/admin/properties/${propertyModal.editData?.id}` : '/api/admin/properties';
      const method = isEdit ? 'PUT' : 'POST';

      await safeFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(propertyForm)
      });

      showToast(`Property ${isEdit ? 'updated' : 'created'} successfully!`, 'success');
      setPropertyModal({ open: false });
      fetchAdminAll();
      fetchMarketplace();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const deleteProperty = async (id: string | number) => {
    if (!token || !confirm('Are you sure you want to delete this property and its associated units?')) return;
    try {
      await safeFetch(`/api/admin/properties/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast('Property deleted successfully', 'success');
      fetchAdminAll();
      fetchMarketplace();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // Unit CRUD
  const saveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const isEdit = !!unitModal.editData;
      const url = isEdit ? `/api/admin/units/${unitModal.editData?.id}` : '/api/admin/units';
      const method = isEdit ? 'PUT' : 'POST';

      await safeFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(unitForm)
      });

      showToast(`Unit ${isEdit ? 'updated' : 'created'} successfully!`, 'success');
      setUnitModal({ open: false });
      fetchAdminAll();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const deleteUnit = async (id: string | number) => {
    if (!token || !confirm('Are you sure you want to delete this unit?')) return;
    try {
      await safeFetch(`/api/admin/units/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast('Unit deleted successfully', 'success');
      fetchAdminAll();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // Lease CRUD
  const saveLease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    try {
      const isEdit = !!leaseModal.editData;
      const url = isEdit ? `/api/admin/leases/${leaseModal.editData?.id}` : '/api/admin/leases';
      const method = isEdit ? 'PUT' : 'POST';

      await safeFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(leaseForm)
      });

      showToast(`Lease ${isEdit ? 'updated' : 'created'} successfully!`, 'success');
      setLeaseModal({ open: false });
      fetchAdminAll();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const deleteLease = async (id: string | number) => {
    if (!token || !confirm('Are you sure you want to terminate/delete this lease?')) return;
    try {
      await safeFetch(`/api/admin/leases/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast('Lease record deleted', 'success');
      fetchAdminAll();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // User Management
  const saveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !userModal.editData) return;
    try {
      await safeFetch(`/api/admin/users/${userModal.editData.id}/modify`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(userForm)
      });

      showToast('User record updated', 'success');
      setUserModal({ open: false });
      fetchAdminAll();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const deleteUser = async (id: string | number) => {
    if (!token || !confirm('Are you sure you want to remove this user from the system?')) return;
    try {
      await safeFetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      showToast('User removed successfully', 'success');
      fetchAdminAll();
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  // ==========================================
  // RENDER UI
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans pb-20 md:pb-0">
      {/* Toast Notification Banner */}
      {toast && (
        <div
          className={`fixed top-4 right-4 left-4 md:left-auto md:w-96 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-white font-medium transition-all transform animate-bounce ${
            toast.type === 'success'
              ? 'bg-emerald-600'
              : toast.type === 'error'
              ? 'bg-red-600'
              : 'bg-slate-900'
          }`}
        >
          <Bell className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm">{toast.message}</span>
        </div>
      )}

      {/* Header & Navigation Bar */}
      <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('marketplace')}>
            <div className="p-2 bg-emerald-500 rounded-xl text-slate-950 font-bold shadow-md">
              <Building className="w-6 h-6" />
            </div>
            <div>
              <span className="font-black text-xl tracking-wide bg-gradient-to-r from-white via-slate-200 to-emerald-400 bg-clip-text text-transparent">
                PropTech Hub
              </span>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-2">
            <button
              onClick={() => setActiveTab('marketplace')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'marketplace' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Home className="w-4 h-4" />
              <span>Marketplace</span>
            </button>

            {user?.role === 'tenant' && (
              <button
                onClick={() => setActiveTab('tenant')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'tenant' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <User className="w-4 h-4" />
                <span>Tenant Portal</span>
              </button>
            )}

            {(user?.role === 'landlord' || user?.role === 'admin') && (
              <button
                onClick={() => setActiveTab('landlord')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'landlord' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Building className="w-4 h-4" />
                <span>Landlord Portal</span>
              </button>
            )}

            {user?.role === 'admin' && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                  activeTab === 'admin' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Super Admin</span>
              </button>
            )}

            {/* Auth Actions */}
            {user ? (
              <div className="flex items-center gap-3 pl-3 border-l border-slate-800">
                <div className="text-right">
                  <p className="text-xs font-bold text-slate-200">{user.fullName}</p>
                  <p className="text-[10px] text-emerald-400 capitalize font-medium">{user.role}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition-colors"
                  title="Log Out"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setActiveTab('auth')}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-sm transition-all shadow-md"
              >
                <Lock className="w-4 h-4" />
                <span>Sign In</span>
              </button>
            )}
          </nav>

          {/* Mobile Menu Toggle Button */}
          <div className="md:hidden flex items-center gap-2">
            {user && (
              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-400">
                <LogOut className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-slate-300 hover:bg-slate-800 rounded-xl"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-slate-900 border-b border-slate-800 px-4 pt-2 pb-4 space-y-2">
            <button
              onClick={() => { setActiveTab('marketplace'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold ${
                activeTab === 'marketplace' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Home className="w-5 h-5" /> Marketplace
            </button>

            {user?.role === 'tenant' && (
              <button
                onClick={() => { setActiveTab('tenant'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold ${
                  activeTab === 'tenant' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <User className="w-5 h-5" /> Tenant Portal
              </button>
            )}

            {(user?.role === 'landlord' || user?.role === 'admin') && (
              <button
                onClick={() => { setActiveTab('landlord'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold ${
                  activeTab === 'landlord' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Building className="w-5 h-5" /> Landlord Portal
              </button>
            )}

            {user?.role === 'admin' && (
              <button
                onClick={() => { setActiveTab('admin'); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold ${
                  activeTab === 'admin' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <ShieldCheck className="w-5 h-5" /> Super Admin Control
              </button>
            )}

            {!user && (
              <button
                onClick={() => { setActiveTab('auth'); setMobileMenuOpen(false); }}
                className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-slate-950 font-bold py-3 rounded-xl text-sm mt-2"
              >
                <Lock className="w-4 h-4" /> Sign In / Register
              </button>
            )}
          </div>
        )}
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {/* ========================================== */}
        {/* TAB 1: PUBLIC MARKETPLACE                  */}
        {/* ========================================== */}
        {activeTab === 'marketplace' && (
          <div className="space-y-6">
            {/* Mobile First Hero Banner */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 rounded-3xl p-6 sm:p-10 text-white shadow-xl relative overflow-hidden">
              <div className="max-w-2xl space-y-3">
                <span className="inline-block px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-bold rounded-full uppercase tracking-wider">
                  Verified Kenya Real Estate
                </span>
                <h1 className="text-2xl sm:text-4xl font-black tracking-tight leading-snug">
                  Modern Rentals, Built For Mobile.
                </h1>
                <p className="text-slate-300 text-sm sm:text-base">
                  Search properties, view real-time availability, and apply instantly.
                </p>
              </div>

              {/* Mobile Adaptive Search Filter */}
              <div className="mt-6 bg-white/10 backdrop-blur-md p-3 sm:p-4 rounded-2xl border border-white/10 grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                <div className="relative">
                  <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Title, address, or city..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-900/90 text-white rounded-xl text-xs sm:text-sm border border-slate-700 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <select
                  value={countyFilter}
                  onChange={(e) => setCountyFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900/90 text-white rounded-xl text-xs sm:text-sm border border-slate-700 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">All Counties</option>
                  <option value="Nairobi">Nairobi</option>
                  <option value="Kiambu">Kiambu</option>
                  <option value="Mombasa">Mombasa</option>
                  <option value="Nakuru">Nakuru</option>
                </select>

                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-900/90 text-white rounded-xl text-xs sm:text-sm border border-slate-700 focus:outline-none focus:border-emerald-500"
                >
                  <option value="">All Property Types</option>
                  <option value="Apartment">Apartment</option>
                  <option value="House">House</option>
                  <option value="Commercial">Commercial</option>
                  <option value="Villa">Villa</option>
                </select>

                <button
                  onClick={fetchMarketplace}
                  className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-md"
                >
                  <Filter className="w-4 h-4" /> Filter Listings
                </button>
              </div>
            </div>

            {/* Properties Listing Header */}
            <div className="flex items-center justify-between pt-2">
              <h2 className="text-xl font-bold text-slate-900">Featured Properties</h2>
              <button
                onClick={fetchMarketplace}
                className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 hover:text-emerald-700"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh
              </button>
            </div>

            {/* Property Cards */}
            {loadingMarketplace ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="bg-white rounded-2xl h-64 p-4 border border-slate-200 animate-pulse space-y-4">
                    <div className="bg-slate-200 h-32 rounded-xl" />
                    <div className="h-5 bg-slate-200 rounded w-3/4" />
                    <div className="h-4 bg-slate-200 rounded w-1/2" />
                  </div>
                ))}
              </div>
            ) : marketplaceProperties.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 space-y-3">
                <AlertCircle className="w-10 h-10 text-slate-400 mx-auto" />
                <h3 className="text-base font-bold text-slate-700">No properties available</h3>
                <p className="text-xs text-slate-500">Adjust search parameters or check back later.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {marketplaceProperties.map((prop) => (
                  <div
                    key={prop.id}
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      <div className="relative h-40 bg-slate-800 flex items-center justify-center text-slate-500">
                        <Building className="w-14 h-14 opacity-30" />
                        <span className="absolute top-3 left-3 bg-emerald-500 text-slate-950 font-black text-[10px] px-2.5 py-1 rounded-full uppercase tracking-wider">
                          {prop.propertyType}
                        </span>
                        <span className="absolute top-3 right-3 bg-slate-900/80 backdrop-blur-md text-white text-[10px] font-semibold px-2.5 py-1 rounded-full">
                          {prop.county}
                        </span>
                      </div>
                      <div className="p-4 space-y-2">
                        <h3 className="font-bold text-base text-slate-900 leading-snug">{prop.title}</h3>
                        <p className="text-xs text-slate-500 line-clamp-2">{prop.description}</p>
                        <div className="text-[11px] font-semibold text-slate-600 bg-slate-50 p-2 rounded-xl border border-slate-100">
                          📍 {prop.address}, {prop.city}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 pt-0 border-t border-slate-100 flex items-center justify-between mt-2">
                      <div>
                        <span className="text-[10px] text-slate-400 block font-semibold">Vacant Units</span>
                        <span className="font-black text-slate-900 text-xs">
                          {prop.Units ? prop.Units.filter((u) => !u.isOccupied).length : 0} Available
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          if (!user) {
                            setActiveTab('auth');
                            showToast('Please sign in to apply', 'info');
                          } else {
                            showToast(`Inquiry sent for ${prop.title}. Contact landlord.`, 'info');
                          }
                        }}
                        className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1 transition-all"
                      >
                        Inquire <ChevronRight className="w-3.5 h-3.5" />
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
          <div className="space-y-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900">Tenant Dashboard</h1>
              <p className="text-xs sm:text-sm text-slate-500">View active lease agreements and log maintenance issues.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Leases Column */}
              <div className="lg:col-span-2 space-y-4">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-600" /> Active Lease Agreements
                </h2>

                {myLeases.length === 0 ? (
                  <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-2">
                    <Home className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="text-slate-700 text-sm font-semibold">No active leases registered.</p>
                  </div>
                ) : (
                  myLeases.map((lease) => (
                    <div key={lease.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md uppercase">
                            Lease Active
                          </span>
                          <h3 className="text-base font-bold text-slate-900 mt-1">
                            Unit {lease.Unit?.unitNumber || 'N/A'} - {lease.Unit?.Property?.title || 'Property'}
                          </h3>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 font-semibold">Rent</p>
                          <p className="text-base font-black text-slate-900">
                            KES {lease.rentAmount?.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-slate-400 text-[10px] block">Start Date</span>
                          <span className="font-semibold text-slate-700">{lease.startDate || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 text-[10px] block">End Date</span>
                          <span className="font-semibold text-slate-700">{lease.endDate || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Maintenance Request Form */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-emerald-600" /> Maintenance Request
                </h2>

                <form onSubmit={handleMaintenanceSubmit} className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Property / Unit ID</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Property ID 1"
                      value={maintenanceForm.propertyId}
                      onChange={(e) => setMaintenanceForm({ ...maintenanceForm, propertyId: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">Category</label>
                      <select
                        value={maintenanceForm.category}
                        onChange={(e) => setMaintenanceForm({ ...maintenanceForm, category: e.target.value })}
                        className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
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
                        className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Subject</label>
                    <input
                      type="text"
                      required
                      placeholder="Brief title"
                      value={maintenanceForm.title}
                      onChange={(e) => setMaintenanceForm({ ...maintenanceForm, title: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Description</label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Details..."
                      value={maintenanceForm.description}
                      onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Photos (Up to 3)</label>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => setMaintenanceFiles(e.target.files)}
                      className="w-full text-xs text-slate-500 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2 transition-all"
                  >
                    <Upload className="w-4 h-4" /> Log Ticket
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 3: LANDLORD PORTAL                     */}
        {/* ========================================== */}
        {activeTab === 'landlord' && (user?.role === 'landlord' || user?.role === 'admin') && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-slate-900">Landlord Portal</h1>
                <p className="text-xs sm:text-sm text-slate-500">Manage registered rental properties and approvals.</p>
              </div>

              <button
                onClick={() => {
                  setPropertyForm({ title: '', description: '', propertyType: 'Apartment', county: 'Nairobi', city: '', address: '', status: 'approved' });
                  setPropertyModal({ open: true, editData: null });
                }}
                className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md transition-all"
              >
                <Plus className="w-4 h-4" /> Add Property
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-100 font-bold text-slate-800 text-sm">Property Portfolio</div>

              <div className="divide-y divide-slate-100">
                {marketplaceProperties.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">No active properties registered.</div>
                ) : (
                  marketplaceProperties.map((p) => (
                    <div key={p.id} className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-slate-900 text-sm sm:text-base">{p.title}</h3>
                          <span
                            className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
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
                        <p className="text-xs text-slate-500 mt-0.5">
                          {p.propertyType} • {p.address}, {p.city} ({p.county})
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1 rounded-lg">
                          Units: {p.Units ? p.Units.length : 0}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 4: SUPER ADMIN ENGINE (FULL CRUD)      */}
        {/* ========================================== */}
        {activeTab === 'admin' && user?.role === 'admin' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900">Super Admin Command Center</h1>
              <p className="text-xs sm:text-sm text-slate-500">Full administrative CRUD access for properties, units, leases, and users.</p>
            </div>

            {/* Admin Metrics Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Properties</p>
                <p className="text-xl font-black text-slate-900 mt-1">{adminProperties.length}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Units</p>
                <p className="text-xl font-black text-slate-900 mt-1">{adminUnits.length}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Leases</p>
                <p className="text-xl font-black text-slate-900 mt-1">{adminLeases.length}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Users</p>
                <p className="text-xl font-black text-slate-900 mt-1">{adminUsers.length}</p>
              </div>
            </div>

            {/* Admin Navigation Sub-Tabs */}
            <div className="flex border-b border-slate-200 overflow-x-auto gap-2 pb-1">
              {(['properties', 'units', 'leases', 'users', 'logs'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setAdminSubTab(tab)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold capitalize transition-all whitespace-nowrap ${
                    adminSubTab === tab ? 'bg-slate-900 text-white shadow-sm' : 'bg-white text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* SUB-TAB 1: ADMIN PROPERTIES */}
            {adminSubTab === 'properties' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-bold text-slate-900">Manage Properties</h3>
                  <button
                    onClick={() => {
                      setPropertyForm({ title: '', description: '', propertyType: 'Apartment', county: 'Nairobi', city: '', address: '', status: 'approved' });
                      setPropertyModal({ open: true, editData: null });
                    }}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Property
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                  {adminProperties.map((p) => (
                    <div key={p.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900 text-sm">{p.title}</p>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">{p.status}</span>
                        </div>
                        <p className="text-xs text-slate-500">{p.city}, {p.county} - {p.address}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setPropertyForm({ title: p.title, description: p.description, propertyType: p.propertyType, county: p.county, city: p.city, address: p.address, status: p.status });
                            setPropertyModal({ open: true, editData: p });
                          }}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteProperty(p.id)}
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUB-TAB 2: ADMIN UNITS */}
            {adminSubTab === 'units' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-bold text-slate-900">Manage Units</h3>
                  <button
                    onClick={() => {
                      setUnitForm({ propertyId: adminProperties[0]?.id?.toString() || '', unitNumber: '', rentAmount: '', isOccupied: false });
                      setUnitModal({ open: true, editData: null });
                    }}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Unit
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                  {adminUnits.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">No units created yet.</div>
                  ) : (
                    adminUnits.map((u) => (
                      <div key={u.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                          <p className="font-bold text-slate-900 text-sm">Unit {u.unitNumber}</p>
                          <p className="text-xs text-slate-500">Rent: KES {u.rentAmount} | Status: {u.isOccupied ? 'Occupied' : 'Vacant'}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setUnitForm({ propertyId: (u.propertyId || '').toString(), unitNumber: u.unitNumber, rentAmount: u.rentAmount.toString(), isOccupied: u.isOccupied });
                              setUnitModal({ open: true, editData: u });
                            }}
                            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteUnit(u.id)}
                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB 3: ADMIN LEASES */}
            {adminSubTab === 'leases' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-base font-bold text-slate-900">Manage Leases</h3>
                  <button
                    onClick={() => {
                      setLeaseForm({ tenantId: adminUsers[0]?.id?.toString() || '', unitId: adminUnits[0]?.id?.toString() || '', startDate: '', endDate: '', rentAmount: '' });
                      setLeaseModal({ open: true, editData: null });
                    }}
                    className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-1.5 rounded-xl text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Assign Lease
                  </button>
                </div>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                  {adminLeases.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">No active leases found.</div>
                  ) : (
                    adminLeases.map((l) => (
                      <div key={l.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                        <div>
                          <p className="font-bold text-slate-900 text-sm">Lease #{l.id} - Unit {l.Unit?.unitNumber || l.unitId}</p>
                          <p className="text-xs text-slate-500">Rent: KES {l.rentAmount} | Dates: {l.startDate} to {l.endDate}</p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => deleteLease(l.id)}
                            className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg"
                            title="Delete Lease"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* SUB-TAB 4: ADMIN USERS */}
            {adminSubTab === 'users' && (
              <div className="space-y-4">
                <h3 className="text-base font-bold text-slate-900">User Accounts</h3>

                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100">
                  {adminUsers.map((u) => (
                    <div key={u.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-slate-900 text-sm">{u.fullName}</p>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700 uppercase">{u.role}</span>
                        </div>
                        <p className="text-xs text-slate-500">Phone: {u.phoneNumber}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setUserForm({ fullName: u.fullName, role: u.role, isActive: u.isActive ?? true });
                            setUserModal({ open: true, editData: u });
                          }}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deleteUser(u.id)}
                          className="p-1.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUB-TAB 5: AUDIT LOGS */}
            {adminSubTab === 'logs' && (
              <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-xl space-y-3">
                <h3 className="font-bold text-sm text-emerald-400 flex items-center gap-2">
                  <Activity className="w-4 h-4" /> System Audit Stream
                </h3>
                <div className="space-y-2 max-h-72 overflow-y-auto font-mono text-[11px]">
                  {adminLogs.map((log) => (
                    <div key={log.id} className="p-2.5 bg-slate-800 rounded-xl border border-slate-700 flex justify-between">
                      <span><strong className="text-emerald-400">[{log.action}]</strong> Target: {log.targetType} #{log.targetId}</span>
                      <span className="text-slate-400">{new Date(log.createdAt).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================== */}
        {/* TAB 5: AUTHENTICATION SCREEN               */}
        {/* ========================================== */}
        {activeTab === 'auth' && (
          <div className="max-w-md mx-auto my-8 bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xl space-y-5">
            <div className="text-center space-y-1.5">
              <div className="w-12 h-12 bg-emerald-500/10 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto">
                <Lock className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                {authMode === 'login' ? 'Sign In to Account' : 'Create New Account'}
              </h2>
              <p className="text-xs text-slate-500">Authenticate using your registered mobile number</p>
            </div>

            {authError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-3.5">
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
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Account Role</label>
                    <select
                      value={roleInput}
                      onChange={(e: any) => setRoleInput(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-emerald-500"
                    >
                      <option value="tenant">Tenant</option>
                      <option value="landlord">Landlord</option>
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Mobile Phone Number or Admin Username</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    required
                    placeholder="07XXXXXXXX or admin"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-emerald-500"
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
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-3 rounded-xl text-xs sm:text-sm transition-all flex items-center justify-center gap-2 shadow-md"
              >
                {authLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : authMode === 'login' ? 'Sign In' : 'Register'}
              </button>
            </form>

            <div className="text-center pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                className="text-xs text-emerald-600 hover:underline font-bold"
              >
                {authMode === 'login' ? "Don't have an account? Sign Up" : 'Already registered? Sign In'}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ========================================== */}
      {/* MODALS (ADMIN CRUD FORMS)                  */}
      {/* ========================================== */}

      {/* Property Modal */}
      {propertyModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-slate-900">{propertyModal.editData ? 'Edit Property' : 'Add Property'}</h3>
              <button onClick={() => setPropertyModal({ open: false })}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={saveProperty} className="space-y-3 text-xs">
              <input type="text" placeholder="Title" required value={propertyForm.title} onChange={(e) => setPropertyForm({ ...propertyForm, title: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
              <input type="text" placeholder="County" required value={propertyForm.county} onChange={(e) => setPropertyForm({ ...propertyForm, county: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
              <input type="text" placeholder="City" required value={propertyForm.city} onChange={(e) => setPropertyForm({ ...propertyForm, city: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
              <input type="text" placeholder="Address" required value={propertyForm.address} onChange={(e) => setPropertyForm({ ...propertyForm, address: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
              <textarea placeholder="Description" required value={propertyForm.description} onChange={(e) => setPropertyForm({ ...propertyForm, description: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
              <button type="submit" className="w-full bg-emerald-500 font-bold p-2.5 rounded-xl text-slate-950">Save Property</button>
            </form>
          </div>
        </div>
      )}

      {/* Unit Modal */}
      {unitModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-slate-900">{unitModal.editData ? 'Edit Unit' : 'Add Unit'}</h3>
              <button onClick={() => setUnitModal({ open: false })}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={saveUnit} className="space-y-3 text-xs">
              <select value={unitForm.propertyId} onChange={(e) => setUnitForm({ ...unitForm, propertyId: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl">
                <option value="">Select Property</option>
                {adminProperties.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              <input type="text" placeholder="Unit Number (e.g. A1)" required value={unitForm.unitNumber} onChange={(e) => setUnitForm({ ...unitForm, unitNumber: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
              <input type="number" placeholder="Rent Amount" required value={unitForm.rentAmount} onChange={(e) => setUnitForm({ ...unitForm, rentAmount: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
              <button type="submit" className="w-full bg-emerald-500 font-bold p-2.5 rounded-xl text-slate-950">Save Unit</button>
            </form>
          </div>
        </div>
      )}

      {/* User Modal */}
      {userModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="font-bold text-slate-900">Edit User Clearance</h3>
              <button onClick={() => setUserModal({ open: false })}><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <form onSubmit={saveUser} className="space-y-3 text-xs">
              <input type="text" placeholder="Full Name" required value={userForm.fullName} onChange={(e) => setUserForm({ ...userForm, fullName: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl" />
              <select value={userForm.role} onChange={(e: any) => setUserForm({ ...userForm, role: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl">
                <option value="tenant">Tenant</option>
                <option value="landlord">Landlord</option>
                <option value="admin">Admin</option>
              </select>
              <button type="submit" className="w-full bg-emerald-500 font-bold p-2.5 rounded-xl text-slate-950">Save User</button>
            </form>
          </div>
        </div>
      )}

      {/* MOBILE BOTTOM NAVIGATION BAR */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 py-2 px-4 flex justify-around items-center z-40 text-slate-400 text-[10px]">
        <button onClick={() => setActiveTab('marketplace')} className={`flex flex-col items-center gap-1 ${activeTab === 'marketplace' ? 'text-emerald-400 font-bold' : ''}`}>
          <Home className="w-5 h-5" /> Marketplace
        </button>
        {user?.role === 'tenant' && (
          <button onClick={() => setActiveTab('tenant')} className={`flex flex-col items-center gap-1 ${activeTab === 'tenant' ? 'text-emerald-400 font-bold' : ''}`}>
            <User className="w-5 h-5" /> Portal
          </button>
        )}
        {(user?.role === 'landlord' || user?.role === 'admin') && (
          <button onClick={() => setActiveTab('landlord')} className={`flex flex-col items-center gap-1 ${activeTab === 'landlord' ? 'text-emerald-400 font-bold' : ''}`}>
            <Building className="w-5 h-5" /> Landlord
          </button>
        )}
        {user?.role === 'admin' && (
          <button onClick={() => setActiveTab('admin')} className={`flex flex-col items-center gap-1 ${activeTab === 'admin' ? 'text-emerald-400 font-bold' : ''}`}>
            <ShieldCheck className="w-5 h-5" /> Admin
          </button>
        )}
      </div>
    </div>
  );
}
