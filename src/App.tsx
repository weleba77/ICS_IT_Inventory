/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Search, 
  LogOut, 
  LogIn, 
  Package, 
  Camera, 
  Loader2, 
  Trash2, 
  Edit2, 
  CheckCircle2, 
  XCircle, 
  ChevronDown, 
  ChevronUp,
  Filter,
  FileText,
  AlertCircle,
  Download,
  Shield,
  User
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  db, 
  auth, 
  signIn, 
  logOut, 
  OperationType, 
  handleFirestoreError 
} from './firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  getDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { GoogleGenAI, Type } from "@google/genai";
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---

interface InventoryItem {
  id?: string;
  deviceName: string;
  serialNumber: string;
  type: string;
  location: string;
  notes: string;
  status: 'ACTIVE' | 'INACTIVE';
  remarks: string;
  checkedDate: string;
  responsiblePerson: string;
  createdAt?: any;
  updatedAt?: any;
  createdBy: string;
}

// --- Components ---

const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  isLoading, 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost', isLoading?: boolean }) => {
  const variants = {
    primary: 'bg-zinc-900 text-white hover:bg-zinc-800',
    secondary: 'bg-white text-zinc-900 border border-zinc-200 hover:bg-zinc-50',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    ghost: 'bg-transparent text-zinc-600 hover:bg-zinc-100'
  };

  return (
    <button 
      className={cn(
        'px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        className
      )}
      disabled={isLoading}
      {...props}
    >
      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : children}
    </button>
  );
};

const Input = ({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label?: string, error?: string }) => (
  <div className="space-y-1 w-full">
    {label && <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{label}</label>}
    <input 
      className={cn(
        "w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all",
        error && "border-red-500 focus:ring-red-500/10 focus:border-red-500"
      )}
      {...props}
    />
    {error && <p className="text-xs text-red-500">{error}</p>}
  </div>
);

const Select = ({ label, options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string, options: { value: string, label: string }[] }) => (
  <div className="space-y-1 w-full">
    {label && <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{label}</label>}
    <select 
      className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all"
      {...props}
    >
      {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  </div>
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState(auth.currentUser);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof InventoryItem; direction: 'asc' | 'desc' } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Form State
  const [formData, setFormData] = useState<Partial<InventoryItem>>({
    deviceName: '',
    serialNumber: '',
    type: '',
    location: '',
    notes: '',
    status: 'ACTIVE',
    remarks: '',
    checkedDate: new Date().toISOString().split('T')[0],
    responsiblePerson: ''
  });

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
      if (u) {
        // Initialize User Profile & Check Admin Status
        const adminEmail = "ephremweleba94@gmail.com";
        
        const initUser = async () => {
          try {
            const userRef = doc(db, 'users', u.uid);
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) {
              await setDoc(userRef, {
                displayName: u.displayName,
                email: u.email,
                photoURL: u.photoURL,
                role: u.email === adminEmail ? 'admin' : 'viewer',
                createdAt: serverTimestamp()
              });
            }
          } catch (err) {
            console.error("Error initializing user:", err);
          }
        };
        initUser();

        if (u.email === adminEmail && u.emailVerified) {
          setIsAdmin(true);
        } else {
          // Also check Firestore for role
          const unsubRole = onSnapshot(doc(db, 'users', u.uid), (docSnap) => {
            if (docSnap.exists() && docSnap.data().role === 'admin') {
              setIsAdmin(true);
            } else {
              setIsAdmin(u.email === adminEmail && u.emailVerified);
            }
          });
          return () => unsubRole();
        }

        const q = query(collection(db, 'inventory'), orderBy('createdAt', 'desc'));
        const unsubItems = onSnapshot(q, (snapshot) => {
          const fetchedItems = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as InventoryItem[];
          setItems(fetchedItems);
          setLoading(false);
        }, (err) => {
          handleFirestoreError(err, OperationType.LIST, 'inventory');
        });
        return () => unsubItems();
      } else {
        setItems([]);
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      const data = {
        ...formData,
        updatedAt: serverTimestamp(),
        createdBy: user.uid
      };

      if (editingItem?.id) {
        await updateDoc(doc(db, 'inventory', editingItem.id), data);
      } else {
        await addDoc(collection(db, 'inventory'), {
          ...data,
          createdAt: serverTimestamp()
        });
      }

      setIsAdding(false);
      setEditingItem(null);
      setFormData({
        deviceName: '',
        serialNumber: '',
        type: '',
        location: '',
        notes: '',
        status: 'ACTIVE',
        remarks: '',
        checkedDate: new Date().toISOString().split('T')[0],
        responsiblePerson: ''
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'inventory');
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;
    try {
      await deleteDoc(doc(db, 'inventory', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'inventory');
    }
  };

  const handleScanImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsScanning(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            {
              parts: [
                { text: "Extract all inventory items from this table image. Return a JSON array of objects with keys: deviceName, serialNumber, type, location, notes, status (must be 'ACTIVE' or 'INACTIVE'), remarks, checkedDate (format YYYY-MM-DD if possible), responsiblePerson. If a value is unknown, use an empty string. Only return the JSON array." },
                { inlineData: { mimeType: file.type, data: base64Data } }
              ]
            }
          ],
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  deviceName: { type: Type.STRING },
                  serialNumber: { type: Type.STRING },
                  type: { type: Type.STRING },
                  location: { type: Type.STRING },
                  notes: { type: Type.STRING },
                  status: { type: Type.STRING },
                  remarks: { type: Type.STRING },
                  checkedDate: { type: Type.STRING },
                  responsiblePerson: { type: Type.STRING }
                },
                required: ["deviceName", "serialNumber", "type", "location", "status", "responsiblePerson"]
              }
            }
          }
        });

        const extractedItems = JSON.parse(response.text || '[]');
        
        // Batch add to Firestore
        for (const item of extractedItems) {
          await addDoc(collection(db, 'inventory'), {
            ...item,
            status: item.status?.toUpperCase() === 'ACTIVE' ? 'ACTIVE' : 'INACTIVE',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            createdBy: user.uid
          });
        }
        
        setIsScanning(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error(err);
      setError("Failed to scan image. Please try again.");
      setIsScanning(false);
    }
  };

  const handleExportCSV = () => {
    if (items.length === 0) return;

    const headers = ["Device Name", "Serial Number", "Type", "Location", "Status", "Responsible Person", "Notes", "Remarks", "Checked Date"];
    const csvRows = [
      headers.join(','), // Header row
      ...items.map(item => [
        `"${item.deviceName.replace(/"/g, '""')}"`,
        `"${item.serialNumber.replace(/"/g, '""')}"`,
        `"${item.type.replace(/"/g, '""')}"`,
        `"${item.location.replace(/"/g, '""')}"`,
        `"${item.status}"`,
        `"${(item.responsiblePerson || '').replace(/"/g, '""')}"`,
        `"${(item.notes || '').replace(/"/g, '""')}"`,
        `"${(item.remarks || '').replace(/"/g, '""')}"`,
        `"${item.checkedDate}"`
      ].join(','))
    ];

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `ics_it_inventory_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSort = (key: keyof InventoryItem) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredItems = items.filter(item => 
    item.deviceName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.type.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.location.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.responsiblePerson.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    const aValue = a[key] || '';
    const bValue = b[key] || '';
    
    if (aValue < bValue) return direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white p-8 rounded-2xl shadow-sm border border-zinc-200 text-center space-y-6"
        >
          <div className="w-16 h-16 bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto">
            <Package className="text-white w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-zinc-900">ICS_IT Inventory</h1>
            <p className="text-zinc-500">Sign in to manage networking device inventory for ICS_IT.</p>
          </div>
          <Button onClick={signIn} className="w-full py-3">
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans">
      {/* Header */}
      <header className="bg-white border-bottom border-zinc-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center">
              <Package className="text-white w-5 h-5" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">ICS_IT Inventory</h1>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 text-sm text-zinc-500 mr-4">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              System Online
            </div>
            <div className="flex items-center gap-3 bg-zinc-100 p-1 rounded-full pr-4">
              <img src={user.photoURL || ''} alt="" className="w-8 h-8 rounded-full border border-white" />
              <div className="flex flex-col">
                <span className="text-sm font-bold hidden sm:inline leading-none">{user.displayName}</span>
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-tighter px-1.5 py-0.5 rounded mt-0.5 w-fit",
                  isAdmin ? "bg-zinc-900 text-white" : "bg-zinc-200 text-zinc-600"
                )}>
                  {isAdmin ? 'Admin' : 'Viewer'}
                </span>
              </div>
              <button onClick={logOut} className="p-1 hover:text-red-500 transition-colors ml-2">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
        {/* Actions Bar */}
        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input 
              type="text" 
              placeholder="Search by device, serial, type..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-900 transition-all"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="flex gap-2 w-full md:w-auto">
            <Button variant="secondary" onClick={handleExportCSV} disabled={items.length === 0}>
              <Download className="w-4 h-4" />
              Export CSV
            </Button>
            {isAdmin && (
              <>
                <label className="flex-1 md:flex-none">
                  <input type="file" accept="image/*" className="hidden" onChange={handleScanImage} />
                  <Button variant="secondary" className="w-full" isLoading={isScanning}>
                    <Camera className="w-4 h-4" />
                    AI Scan Image
                  </Button>
                </label>
                <Button className="flex-1 md:flex-none" onClick={() => {
                  setEditingItem(null);
                  setFormData({
                    deviceName: '',
                    serialNumber: '',
                    type: '',
                    location: '',
                    notes: '',
                    status: 'ACTIVE',
                    remarks: '',
                    checkedDate: new Date().toISOString().split('T')[0],
                    responsiblePerson: ''
                  });
                  setIsAdding(true);
                }}>
                  <Plus className="w-4 h-4" />
                  Add Item
                </Button>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}

        {/* Inventory Table */}
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-50 border-b border-zinc-200">
                  <th 
                    className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest cursor-pointer hover:bg-zinc-100 transition-colors"
                    onClick={() => handleSort('deviceName')}
                  >
                    <div className="flex items-center gap-2">
                      Device Name
                      {sortConfig?.key === 'deviceName' && (
                        sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest cursor-pointer hover:bg-zinc-100 transition-colors"
                    onClick={() => handleSort('serialNumber')}
                  >
                    <div className="flex items-center gap-2">
                      Serial Number
                      {sortConfig?.key === 'serialNumber' && (
                        sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest cursor-pointer hover:bg-zinc-100 transition-colors"
                    onClick={() => handleSort('type')}
                  >
                    <div className="flex items-center gap-2">
                      Type
                      {sortConfig?.key === 'type' && (
                        sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest cursor-pointer hover:bg-zinc-100 transition-colors"
                    onClick={() => handleSort('location')}
                  >
                    <div className="flex items-center gap-2">
                      Location
                      {sortConfig?.key === 'location' && (
                        sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest cursor-pointer hover:bg-zinc-100 transition-colors"
                    onClick={() => handleSort('responsiblePerson')}
                  >
                    <div className="flex items-center gap-2">
                      Responsible
                      {sortConfig?.key === 'responsiblePerson' && (
                        sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest cursor-pointer hover:bg-zinc-100 transition-colors"
                    onClick={() => handleSort('status')}
                  >
                    <div className="flex items-center gap-2">
                      Status
                      {sortConfig?.key === 'status' && (
                        sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th 
                    className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest cursor-pointer hover:bg-zinc-100 transition-colors"
                    onClick={() => handleSort('checkedDate')}
                  >
                    <div className="flex items-center gap-2">
                      Checked
                      {sortConfig?.key === 'checkedDate' && (
                        sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      )}
                    </div>
                  </th>
                  <th className="px-6 py-4 text-xs font-bold text-zinc-500 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                <AnimatePresence mode="popLayout">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center">
                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-zinc-300" />
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-zinc-500">
                        No items found. Try adding one or scanning an image.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((item) => (
                      <motion.tr 
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        key={item.id} 
                        className="hover:bg-zinc-50/50 transition-colors group"
                      >
                        <td className="px-6 py-4">
                          <div className="font-semibold text-zinc-900">{item.deviceName}</div>
                          <div className="text-xs text-zinc-400 font-mono">{item.notes}</div>
                        </td>
                        <td className="px-6 py-4 text-sm font-mono text-zinc-600">{item.serialNumber}</td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-bold px-2 py-1 bg-zinc-100 rounded text-zinc-600 uppercase">
                            {item.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-600">{item.location}</td>
                        <td className="px-6 py-4 text-sm text-zinc-600 font-medium">{item.responsiblePerson}</td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold",
                            item.status === 'ACTIVE' ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                          )}>
                            {item.status === 'ACTIVE' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {item.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-zinc-500">{item.checkedDate}</td>
                        <td className="px-6 py-4 text-right">
                          {isAdmin && (
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => {
                                  setEditingItem(item);
                                  setFormData(item);
                                  setIsAdding(true);
                                }}
                                className="p-2 hover:bg-zinc-200 rounded-lg text-zinc-600 transition-colors"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => handleDelete(item.id!)}
                                className="p-2 hover:bg-red-100 rounded-lg text-red-500 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-zinc-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                <h2 className="font-bold text-lg">{editingItem ? 'Edit Item' : 'Add New Item'}</h2>
                <button onClick={() => setIsAdding(false)} className="p-2 hover:bg-zinc-200 rounded-full transition-colors">
                  <XCircle className="w-5 h-5 text-zinc-400" />
                </button>
              </div>
              
              <form onSubmit={handleSave} className="p-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input 
                    label="Device Name" 
                    required 
                    value={formData.deviceName} 
                    onChange={e => setFormData({...formData, deviceName: e.target.value})}
                    placeholder="e.g. HUAWEI ROUTER"
                  />
                  <Input 
                    label="Serial Number" 
                    required 
                    value={formData.serialNumber} 
                    onChange={e => setFormData({...formData, serialNumber: e.target.value})}
                    placeholder="e.g. AR2200 SERIES"
                  />
                  <Input 
                    label="Type" 
                    required 
                    value={formData.type} 
                    onChange={e => setFormData({...formData, type: e.target.value})}
                    placeholder="e.g. ROUTER"
                  />
                  <Input 
                    label="Location" 
                    required 
                    value={formData.location} 
                    onChange={e => setFormData({...formData, location: e.target.value})}
                    placeholder="e.g. DATA CENTER"
                  />
                  <Input 
                    label="Responsible Person" 
                    required 
                    value={formData.responsiblePerson} 
                    onChange={e => setFormData({...formData, responsiblePerson: e.target.value})}
                    placeholder="e.g. John Doe"
                  />
                  <Select 
                    label="Status" 
                    value={formData.status} 
                    onChange={e => setFormData({...formData, status: e.target.value as 'ACTIVE' | 'INACTIVE'})}
                    options={[
                      { value: 'ACTIVE', label: 'ACTIVE' },
                      { value: 'INACTIVE', label: 'INACTIVE' }
                    ]}
                  />
                  <Input 
                    label="Checked Date" 
                    type="date"
                    value={formData.checkedDate} 
                    onChange={e => setFormData({...formData, checkedDate: e.target.value})}
                  />
                </div>
                
                <div className="space-y-4">
                  <Input 
                    label="Notes" 
                    value={formData.notes} 
                    onChange={e => setFormData({...formData, notes: e.target.value})}
                    placeholder="Specific location or details..."
                  />
                  <Input 
                    label="Remarks" 
                    value={formData.remarks} 
                    onChange={e => setFormData({...formData, remarks: e.target.value})}
                    placeholder="Additional remarks..."
                  />
                </div>

                <div className="flex gap-3 pt-4 border-t border-zinc-100">
                  <Button type="button" variant="secondary" className="flex-1" onClick={() => setIsAdding(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="flex-1">
                    {editingItem ? 'Update Item' : 'Save Item'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
