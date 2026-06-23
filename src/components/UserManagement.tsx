import React, { useState, useEffect, useCallback } from 'react';
import { User, UserRole, canManageUsers, updateUserRole, deleteUser, resetUserPassword, adminCreateUser } from '../services/auth';
import { rbacService } from '../services/rbacService';
import { useAuth } from '../auth/AuthContext';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import Modal from './Modal';
import { Tooltip } from './Tooltip';

interface UserManagementProps {
  isOpen?: boolean;
  onClose?: () => void;
  inline?: boolean;
}

const UserManagement: React.FC<UserManagementProps> = ({ 
  isOpen = false, 
  onClose = () => {}, 
  inline = false 
}) => {
  // ==========================================
  // 1. ALL HOOKS MUST GO HERE AT THE VERY TOP
  // ==========================================
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<string>('user');
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);

  // Context Hooks
  const { user: currentUser, loading: authLoading } = useAuth();

  // Evaluate permissions
  const currentUserProfile = users.find(u => u.email === currentUser?.email);
  const isSuperAdmin = currentUser?.email?.toLowerCase() === 'pichethneou@gmail.com' || 
    (currentUserProfile ? ['superadmin', 'SuperAdmin', 'admin', 'Admin'].includes(currentUserProfile.role) : false);

  // useCallback Hook
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const querySnapshot = await getDocs(collection(db, 'users'));
      const fetchedUsers = querySnapshot.docs.map(doc => ({
        id: doc.id,
        username: doc.data().name || doc.data().username || '',
        email: doc.data().email || '',
        role: doc.data().role || 'user',
        ...doc.data()
      })) as User[];
      setUsers(fetchedUsers);
    } catch (err: unknown) {
      console.error('Error fetching users:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || 'Failed to fetch users.');
    } finally {
      setLoading(false);
    }
  }, []);

  // useEffect Hook
  useEffect(() => {
    if ((isOpen || inline) && !authLoading) {
      fetchUsers();
    }
  }, [isOpen, inline, authLoading, fetchUsers]);

  useEffect(() => {
    if (!loading && users.length > 0 && !isSuperAdmin) {
      setError('You do not have permission to manage users.');
    } else if (isSuperAdmin) {
      setError(null);
    }
  }, [loading, users, isSuperAdmin]);

  // ==========================================
  // 2. EARLY RETURNS (Must be after all hooks)
  // ==========================================
  if (!authLoading && !isSuperAdmin) {
    if (inline) {
      return (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 text-center border border-gray-200 dark:border-gray-700">
          <p className="text-red-600 dark:text-red-400 font-medium">You do not have permission to manage users.</p>
        </div>
      );
    }
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Access Denied">
        <div className="p-4 text-red-600 font-medium">You do not have permission to manage users.</div>
      </Modal>
    );
  }

  // ==========================================
  // 3. HELPER FUNCTIONS & HANDLERS
  // ==========================================
  const validatePasswordStrength = (pw: string): string | null => {
    if (pw.length < 8) return 'Password must be at least 8 characters long.';
    if (!/[A-Z]/.test(pw)) return 'Password must contain at least one uppercase letter.';
    if (!/[a-z]/.test(pw)) return 'Password must contain at least one lowercase letter.';
    if (!/[0-9]/.test(pw)) return 'Password must contain at least one number.';
    return null; 
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin) {
      setError('Only SuperAdmins can create users.');
      return;
    }

    const passwordError = validatePasswordStrength(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsCreatingUser(true);
    setError(null);
    try {
      // Fix: Align parameter order with the signature in auth.ts (email, password, username, role)
      const { error: err } = await adminCreateUser(email, password, username, role as UserRole);
      if (err) throw new Error(err);

      // Log the creation
      rbacService.add_audit_log(
        currentUser?.email || 'admin',
        'USER_CREATE',
        `Created new user account: "${username}" (${email}) with role: "${role}"`
      );

      await fetchUsers();
      setUsername('');
      setEmail('');
      setPassword('');
      setShowPassword(false);
      setRole('user');
    } catch (err: unknown) {
      console.error('Error creating user:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || 'Failed to create user.');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleUpdateRole = async (userId: string, newRole: string, currentRole: string) => {
    if (!isSuperAdmin || userId === currentUser?.uid) return; 
    
    if (newRole === 'superadmin' || newRole === 'admin') {
      if (!window.confirm(`Are you sure you want to grant ${newRole} privileges to this user?`)) {
        await fetchUsers(); 
        return;
      }
    }

    setUpdatingUserId(userId);
    setError(null);
    try {
      const err = await updateUserRole(userId, newRole as UserRole);
      if (err) throw new Error(err);

      // Log the role assignment
      rbacService.assign_role_to_user(userId, newRole, currentUser?.email || 'admin');

      await fetchUsers(); 
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || 'Failed to update user role.');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const handleOpenResetModal = (userId: string) => {
    setResetUserId(userId);
    setResetPasswordValue('');
    setShowResetPassword(false);
    setIsResetModalOpen(true);
    setError(null);
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || !resetUserId || isResettingPassword) return;

    const passwordError = validatePasswordStrength(resetPasswordValue);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsResettingPassword(true);
    setError(null);
    try {
      const err = await resetUserPassword(resetUserId, resetPasswordValue);
      if (err) throw new Error(err);
      
      const targetUser = users.find(u => u.id === resetUserId);
      const userDesc = targetUser ? `"${targetUser.username}" (${targetUser.email})` : `ID: ${resetUserId}`;
      rbacService.add_audit_log(
        currentUser?.email || 'admin',
        'USER_PASSWORD_RESET',
        `Reset password for user account: ${userDesc}`
      );

      setIsResetModalOpen(false);
      setResetUserId(null);
      alert("Password updated successfully.");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || 'Failed to reset password.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!isSuperAdmin || userId === currentUser?.uid) {
      setError('Superadmins cannot delete their own account or perform this action.');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete this user? This action cannot be undone.`)) return;

    setDeletingUserId(userId);
    setError(null);
    try {
      const targetUser = users.find(u => u.id === userId);
      const userDesc = targetUser ? `"${targetUser.username}" (${targetUser.email})` : `ID: ${userId}`;

      const err = await deleteUser(userId);
      if (err) throw new Error(err);

      rbacService.add_audit_log(
        currentUser?.email || 'admin',
        'USER_DELETE',
        `Deleted user account: ${userDesc}`
      );

      await fetchUsers(); 
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      setError(errorMessage || 'Failed to delete user.');
    } finally {
      setDeletingUserId(null);
    }
  };

  // ==========================================
  // 4. COMPONENT RENDER
  // ==========================================
  const renderContent = () => (
    <div className="space-y-6">
      {isSuperAdmin && (
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-md font-bold text-gray-900 dark:text-white uppercase tracking-wide border-b border-gray-100 dark:border-gray-700 pb-3 mb-4">
            Create User Account
          </h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium">Username</label>
                <input type="text" value={username} onChange={e => setUsername(e.target.value)} required className="mt-1 block w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:text-white dark:border-gray-600" />
              </div>
              <div>
                <label className="block text-sm font-medium">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required className="mt-1 block w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:text-white dark:border-gray-600" />
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium">Password</label>
                <div className="relative mt-1">
                  <input 
                    type={showPassword ? "text" : "password"} 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    required
                    minLength={8}
                    className="block w-full px-3 py-2 border rounded-md pr-10 dark:bg-gray-700 dark:text-white dark:border-gray-600" 
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12.013a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    )}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium">Assign Role</label>
                <select 
                  value={role} 
                  onChange={e => setRole(e.target.value)} 
                  className="mt-1 block w-full px-3 py-2 border rounded-md dark:bg-gray-700 dark:text-white dark:border-gray-600"
                >
                  {rbacService.get_roles().map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              </div>
            </div>
            {error && <div className="text-red-600 dark:text-red-400 text-sm">{error}</div>}
            <div className="flex justify-end pt-2">
              <button type="submit" disabled={isCreatingUser} className="px-4 py-2 bg-indigo-600 text-white rounded-md flex items-center hover:bg-indigo-700 transition-colors">
                {isCreatingUser && <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                Create User
              </button>
            </div>
          </form>
        </div>
      )}

      {error && !isSuperAdmin && <div className="text-red-600 dark:text-red-400 text-sm mb-4">{error}</div>}

      {loading ? (
        <div className="flex justify-center items-center h-24">
          <svg className="animate-spin h-6 w-6 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 shadow-md rounded-lg p-6 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-bold mb-3 text-gray-900 dark:text-white uppercase tracking-wide border-b border-gray-100 dark:border-gray-700 pb-2">Existing Users</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Username</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Email</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Role</th>
                  {isSuperAdmin && <th className="text-right px-4 py-3 font-semibold text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>}
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700 text-gray-700 dark:text-gray-200">
                {users.map(u => {
                  const isOnline = onlineUsers?.some((ou: any) => ou.id === u.id);
                  const roleObj = rbacService.get_roles().find(r => r.id === u.role);
                  return (
                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3.5 whitespace-nowrap font-medium">{u.username}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap">{u.email}</td>
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {isSuperAdmin && u.id !== currentUser?.uid ? (
                          <select
                            value={u.role}
                            onChange={(e) => handleUpdateRole(u.id as string, e.target.value, u.role)}
                            disabled={updatingUserId === u.id}
                            className="block w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-xs dark:bg-gray-700 dark:text-white"
                          >
                            {rbacService.get_roles().map((r) => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                            u.role === 'superadmin' ? 'bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-300' : 
                            u.role === 'admin' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-300' : 
                            'bg-blue-100 text-blue-800 dark:bg-blue-950/30 dark:text-blue-300'
                          }`}>
                            {roleObj ? roleObj.name : u.role}
                          </span>
                        )}
                        {isOnline && (
                          <Tooltip content="Online" position="top">
                            <span className="ml-2 inline-block h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                          </Tooltip>
                        )}
                      </td>
                      {isSuperAdmin && (
                        <td className="px-4 py-3.5 whitespace-nowrap text-right text-xs">
                          {u.id !== currentUser?.uid && (
                            <button
                              onClick={() => handleOpenResetModal(u.id as string)}
                              disabled={updatingUserId === u.id || isResettingPassword}
                              className="text-indigo-600 hover:text-indigo-900 dark:text-indigo-400 dark:hover:text-indigo-200 disabled:opacity-50 font-bold"
                            >
                              Reset PW
                            </button>
                          )}
                          {u.id !== currentUser?.uid && (
                            <button
                              onClick={() => handleDeleteUser(u.id as string)}
                              disabled={deletingUserId === u.id}
                              className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200 disabled:opacity-50 ml-3 font-bold"
                            >
                              {deletingUserId === u.id ? 'Deleting...' : 'Delete'}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      <Modal isOpen={isResetModalOpen} onClose={() => !isResettingPassword && setIsResetModalOpen(false)} title="Reset User Password">
        <form onSubmit={handleResetPassword} className="space-y-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter a new password for <span className="font-semibold text-gray-900 dark:text-white">
              {users.find(u => u.id === resetUserId)?.username}
            </span>.
          </p>
          <div>
            <label className="block text-sm font-medium">New Password</label>
            <div className="relative mt-1">
              <input 
                type={showResetPassword ? "text" : "password"} 
                value={resetPasswordValue} 
                onChange={e => setResetPasswordValue(e.target.value)} 
                required
                minLength={8}
                className="block w-full px-3 py-2 border rounded-md pr-10 dark:bg-gray-700 dark:text-white border-gray-300 dark:border-gray-600" 
                autoFocus
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                onClick={() => setShowResetPassword(!showResetPassword)}
                tabIndex={-1}
              >
                {showResetPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12.013a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                )}
              </button>
            </div>
          </div>
          {error && <div className="text-red-600 text-sm">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setIsResetModalOpen(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md">Cancel</button>
            <button type="submit" disabled={isResettingPassword} className="px-4 py-2 bg-indigo-600 text-white rounded-md flex items-center hover:bg-indigo-700 transition-colors">
              {isResettingPassword && <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
              Update Password
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );

  if (inline) {
    return renderContent();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="User Management (SuperAdmin)">
      {renderContent()}
    </Modal>
  );
};

export default UserManagement;
