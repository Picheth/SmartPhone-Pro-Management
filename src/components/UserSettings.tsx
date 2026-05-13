// src/components/UserSettings.tsx

import React, { useState } from "react";
import {
  Search,
  Plus,
  Edit,
  Trash2,
  ShieldCheck,
  Users,
  Circle,
} from "lucide-react";

interface User {
  id: number;
  name: string;
  email: string;
  branch: string;
  role: string;
  status: "Online" | "Offline";
}

const initialUsers: User[] = [
  {
    id: 1,
    name: "Super Admin",
    email: "pichethneou@gmail.com",
    branch: "Main Branch",
    role: "Admin",
    status: "Online",
  },
  {
    id: 2,
    name: "Main Manager",
    email: "pichethneou@gmail.com",
    branch: "Main Branch",
    role: "Manager",
    status: "Online",
  },
  {
    id: 3,
    name: "Sales Lead",
    email: "sales@system.com",
    branch: "Main Branch",
    role: "Sales",
    status: "Offline",
  },
  {
    id: 4,
    name: "Service Technician",
    email: "technician@system.com",
    branch: "Main Branch",
    role: "Technician",
    status: "Offline",
  },
  {
    id: 5,
    name: "Finance Officer",
    email: "accountant@system.com",
    branch: "Main Branch",
    role: "Accountant",
    status: "Offline",
  },
];

const roleColors: Record<string, string> = {
  Admin: "bg-red-100 text-red-700",
  Manager: "bg-blue-100 text-blue-700",
  Sales: "bg-green-100 text-green-700",
  Technician: "bg-orange-100 text-orange-700",
  Accountant: "bg-purple-100 text-purple-700",
};

const UserSettings: React.FC = () => {
  const [users, setUsers] = useState<User[]>(initialUsers);
  const [search, setSearch] = useState("");

  const filteredUsers = users.filter(
    (user) =>
      user.name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase()) ||
      user.role.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (id: number) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this user?"
    );

    if (confirmed) {
      setUsers((prev) => prev.filter((user) => user.id !== id));
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

        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition">
          <Plus size={18} />
          Add User
        </button>
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
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
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

                <th className="text-right px-6 py-4 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Actions
                </th>
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
                        roleColors[user.role]
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

                  <td className="px-6 py-5">
                    <div className="flex justify-end items-center gap-2">
                      <button className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-sm font-medium">
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
                </tr>
              ))}

              {filteredUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
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
    </div>
  );
};

export default UserSettings;