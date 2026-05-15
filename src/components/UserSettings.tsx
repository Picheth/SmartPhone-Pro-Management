// src/components/UserSettings.tsx

import React, { useState, useEffect, useMemo } from "react";
import {
  Search,
  Plus,
  Edit,
  Trash2,
  ShieldCheck,
  Users,
  Circle,
  Zap,
  X,
  Save
} from "lucide-react";
import { collection, doc, onSnapshot, setDoc, deleteDoc, addDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../auth/AuthContext";

interface User {
  id: string;
  name: string;
  email: string;
  branch: string;
  role: string;
  status: "Online" | "Offline";
  lastLogin?: any;
}

const roleColors: Record<string, string> = {
  Admin: "bg-red-100 text-red-700",
  Manager: "bg-blue-100 text-blue-700",
  Sales: "bg-green-100 text-green-700",
  Technician: "bg-orange-100 text-orange-700",
  Accountant: "bg-purple-100 text-purple-700",
};

const UserSettings: React.FC = () => {
  const { user: authUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [allowOverselling, setAllowOverselling] = useState(false);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);

  // Determine if the current logged-in user is an Admin
  const isAdmin = useMemo(() => {
    return users.find((u) => u.email === authUser?.email)?.role === "Admin";
  }, [users, authUser]);

  const [userForm, setUserForm] = useState({
    name: "",
    email: "",
    branch: "Main Branch",
    role: "Sales",
  });

  useEffect(() => {
    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    });

    const unsubSettings = onSnapshot(doc(db, "settings", "inventory"), (snap) => {
      if (snap.exists()) {
        setAllowOverselling(snap.data().allowOverselling);
      }
    });
    return () => {
      unsubUsers();
      unsubSettings();
    };
  }, []);

  const toggleOverselling = async () => {
    await setDoc(doc(db, "settings", "inventory"), {
      allowOverselling: !allowOverselling
    }, { merge: true });
  };

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      user.role.toLowerCase().includes(search.toLowerCase())
  );

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.name || !userForm.email) {
      alert("Name and Email are required.");
      return;
    }

    setIsSavingUser(true);
    try {
      await addDoc(collection(db, "users"), {
        ...userForm,
        status: "Offline",
        createdAt: serverTimestamp()
      });
      setIsAddingUser(false);
      setUserForm({ name: "", email: "", branch: "Main Branch", role: "Sales" });
    } catch (error) {
      console.error("Error adding user:", error);
      alert("Failed to add user.");
    } finally {
      setIsSavingUser(false);
    }
  };

  const startEdit = (user: User) => {
    setUserForm({
      name: user.name,
      email: user.email,
      branch: user.branch,
      role: user.role,
    });
    setEditingUserId(user.id);
    setIsEditingUser(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUserId) return;

    setIsSavingUser(true);
    try {
      await updateDoc(doc(db, "users", editingUserId), {
        ...userForm,
        updatedAt: serverTimestamp()
      });
      setIsEditingUser(false);
      setEditingUserId(null);
      setUserForm({ name: "", email: "", branch: "Main Branch", role: "Sales" });
    } catch (error) {
      console.error("Error updating user:", error);
      alert("Failed to update user.");
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this user?"
    );

    if (confirmed) {
      try {
        await deleteDoc(doc(db, "users", id));
      } catch (error) {
        console.error("Error deleting user:", error);
        alert("Failed to delete user.");
      }
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            User Settings
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage users, permissions, and access controls
          </p>
        </div>

        {isAdmin && (
          <button 
            onClick={() => setIsAddingUser(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition shadow-sm active:scale-95">
            <Plus size={18} />
            Add User
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Total Users</p>
              <h2 className="text-3xl font-bold text-slate-800 mt-1">
                {users.length}
              </h2>
            </div>

            <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
              <Users className="text-slate-700" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Administrators</p>
              <h2 className="text-3xl font-bold text-slate-800 mt-1">
                {
                  users.filter((u) => u.role === "Admin").length
                }
              </h2>
            </div>

            <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center">
              <ShieldCheck className="text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-500">Online Users</p>
              <h2 className="text-3xl font-bold text-slate-800 mt-1">
                {
                  users.filter((u) => u.status === "Online").length
                }
              </h2>
            </div>

            <div className="w-12 h-12 rounded-2xl bg-green-100 flex items-center justify-center">
              <Circle className="text-green-600 fill-current" size={14} />
            </div>
          </div>
        </div>
      </div>

      {/* Inventory Settings */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
            <Zap size={20} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Inventory Controls</h2>
            <p className="text-xs text-slate-500 font-medium">Global rules for stock management</p>
          </div>
        </div>

        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
          <div className="space-y-1">
            <p className="text-sm font-bold text-slate-700">Allow Overselling</p>
            <p className="text-xs text-slate-500">Allow sales even if stock level is zero or negative</p>
          </div>
          <button 
            onClick={isAdmin ? toggleOverselling : () => alert("Only Administrators can modify global inventory rules.")}
            disabled={!isAdmin}
            className={`w-12 h-6 rounded-full transition-colors relative ${allowOverselling ? 'bg-blue-600' : 'bg-slate-300'}`}
          >
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${allowOverselling ? 'left-7' : 'left-1'}`} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />

          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px]">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                  User
                </th>

                <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Branch
                </th>

                <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Roles
                </th>

                <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Status
                </th>

                <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Last Activity
                </th>

                {isAdmin && (
                  <th className="text-right px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                    Actions
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {filteredUsers.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-slate-100 hover:bg-slate-50 transition"
                >
                  <td className="px-6 py-5">
                    <div>
                      <h3 className="font-semibold text-slate-800">
                        {user.name}
                      </h3>

                      <p className="text-sm text-slate-500 mt-1">
                        {user.email}
                      </p>
                    </div>
                  </td>

                  <td className="px-6 py-5 text-slate-700">
                    {user.branch}
                  </td>

                  <td className="px-6 py-5">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        roleColors[user.role] || "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>

                  <td className="px-6 py-5">
                    <div className="flex items-center gap-2">
                      <Circle
                        size={10}
                        className={
                          user.status === "Online"
                            ? "text-green-500 fill-current"
                            : "text-slate-400 fill-current"
                        }
                      />

                      <span className="text-sm text-slate-600">
                        {user.status}
                      </span>
                    </div>
                  </td>

                  <td className="px-6 py-5 text-sm text-slate-500 font-medium whitespace-nowrap">
                    {user.lastLogin?.seconds 
                      ? new Date(user.lastLogin.seconds * 1000).toLocaleString([], { 
                          dateStyle: 'short', 
                          timeStyle: 'short' 
                        }) 
                      : 'Never'}
                  </td>

                  {isAdmin && (
                    <td className="px-6 py-5">
                      <div className="flex justify-end items-center gap-2">
                        <button 
                          onClick={() => startEdit(user)}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-sm font-medium transition-colors"
                        >
                          <Edit size={15} />
                          Edit
                        </button>

                        <button
                          onClick={() => handleDelete(user.id)}
                          className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium"
                        >
                          <Trash2 size={15} />
                          Delete
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}

              {filteredUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={isAdmin ? 6 : 5}
                    className="text-center py-12 text-slate-500"
                  >
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add User Modal */}
      <AnimatePresence>
        {isAddingUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg shadow-slate-200">
                    <Plus className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 tracking-tight">Add New User</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Registering system staff</p>
                  </div>
                </div>
                <button onClick={() => setIsAddingUser(false)} className="p-2 hover:bg-white rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleAddUser} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Full Name</label>
                  <input 
                    type="text"
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                    value={userForm.name}
                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Email Address</label>
                  <input 
                    type="email"
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all font-mono"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Assigned Branch</label>
                  <input 
                    type="text"
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                    value={userForm.branch}
                    onChange={(e) => setUserForm({ ...userForm, branch: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">User Role</label>
                  <select 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  >
                    {Object.keys(roleColors).map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsAddingUser(false)} className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-all">Cancel</button>
                  <button type="submit" disabled={isSavingUser} className="flex-[2] bg-slate-900 hover:bg-slate-800 text-white px-6 py-3 rounded-xl font-black shadow-lg shadow-slate-900/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:bg-slate-400">
                    {isSavingUser ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-4 h-4" />Create User</>}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit User Modal */}
      <AnimatePresence>
        {isEditingUser && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200"
            >
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-blue-50/50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
                    <Edit className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-800 tracking-tight">Edit User Profile</h3>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Update permissions & access</p>
                  </div>
                </div>
                <button onClick={() => { setIsEditingUser(false); setEditingUserId(null); }} className="p-2 hover:bg-white rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Full Name</label>
                  <input 
                    type="text"
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                    value={userForm.name}
                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Email Address</label>
                  <input 
                    type="email"
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all font-mono"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">Assigned Branch</label>
                  <input 
                    type="text"
                    required
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                    value={userForm.branch}
                    onChange={(e) => setUserForm({ ...userForm, branch: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-1">User Role</label>
                  <select 
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-blue-500 transition-all"
                    value={userForm.role}
                    onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                  >
                    {Object.keys(roleColors).map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => { setIsEditingUser(false); setEditingUserId(null); }} className="flex-1 px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-all">Cancel</button>
                  <button type="submit" disabled={isSavingUser} className="flex-[2] bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-black shadow-lg shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:bg-slate-400">
                    {isSavingUser ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <><Save className="w-4 h-4" />Save Changes</>}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default UserSettings;