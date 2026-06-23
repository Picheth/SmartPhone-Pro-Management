import { getDoc, doc, setDoc } from "firebase/firestore";
import { db } from "./db";

export interface Permission {
  id: string; // e.g. "user.create"
  module: string; // e.g. "user"
  action: string; // e.g. "create"
  description: string;
}

export interface Role {
  id: string; // e.g. "superadmin", "custom_role_1"
  name: string; // e.g. "Super Admin", "Product Editor"
  description: string;
  permissions: string[]; // List of permission IDs
  isSystem?: boolean; // System roles cannot be deleted
}

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  userEmail: string;
  action: string;
  details: string;
  ipAddress?: string;
}

// 1. Initial Granular Permissions Definitions
const DEFAULT_PERMISSIONS: Permission[] = [
  // User Module
  { id: 'user.view', module: 'user', action: 'view', description: 'View list of users' },
  { id: 'user.create', module: 'user', action: 'create', description: 'Create new users' },
  { id: 'user.update', module: 'user', action: 'update', description: 'Modify user roles or details' },
  { id: 'user.delete', module: 'user', action: 'delete', description: 'Delete users from the system' },
  
  // Role Module
  { id: 'role.view', module: 'role', action: 'view', description: 'View system roles and permission matrix' },
  { id: 'role.create', module: 'role', action: 'create', description: 'Create new custom security roles' },
  { id: 'role.update', module: 'role', action: 'update', description: 'Modify role permission matrix' },
  { id: 'role.delete', module: 'role', action: 'delete', description: 'Remove custom security roles' },

  // Permission Module
  { id: 'permission.view', module: 'permission', action: 'view', description: 'View permission registry' },
  { id: 'permission.create', module: 'permission', action: 'create', description: 'Register new modular permissions' },

  // Product Module (Content)
  { id: 'product.view', module: 'product', action: 'view', description: 'View products' },
  { id: 'product.create', module: 'product', action: 'create', description: 'Create new product devices' },
  { id: 'product.update', module: 'product', action: 'update', description: 'Modify products' },
  { id: 'product.delete', module: 'product', action: 'delete', description: 'Delete product devices' },
  { id: 'product.disassemble', module: 'product', action: 'disassemble', description: 'Disassemble products into parts' },

  // Purchase Module (Content)
  { id: 'purchase.view', module: 'purchase', action: 'view', description: 'View purchase orders' },
  { id: 'purchase.create', module: 'purchase', action: 'create', description: 'Create new purchase orders' },
  { id: 'purchase.update', module: 'purchase', action: 'update', description: 'Modify purchase orders' },
  { id: 'purchase.delete', module: 'purchase', action: 'delete', description: 'Delete purchase orders' },

  // Sale Module (Content)
  { id: 'sale.view', module: 'sale', action: 'view', description: 'View sale orders' },
  { id: 'sale.create', module: 'sale', action: 'create', description: 'Create new sale orders' },
  { id: 'sale.update', module: 'sale', action: 'update', description: 'Modify sale orders' },
  { id: 'sale.delete', module: 'sale', action: 'delete', description: 'Delete sale orders' },

  // Location Module (Content)
  { id: 'location.view', module: 'location', action: 'view', description: 'View location' },
  { id: 'location.create', module: 'location', action: 'create', description: 'Add individual location' },
  { id: 'location.update', module: 'location', action: 'update', description: 'Modify location details' },
  { id: 'location.delete', module: 'location', action: 'delete', description: 'Remove location' },

  // Supplier Module (Content)
  { id: 'supplier.view', module: 'supplier', action: 'view', description: 'View repair supplier' },
  { id: 'supplier.create', module: 'supplier', action: 'create', description: 'Create new supplier' },
  { id: 'supplier.update', module: 'supplier', action: 'update', description: 'Modify supplier details' },
  { id: 'supplier.delete', module: 'supplier', action: 'delete', description: 'Delete supplier' },

  // Partner Module (Content)
  { id: 'partner.view', module: 'partner', action: 'view', description: 'View repair partner' },
  { id: 'partner.create', module: 'partner', action: 'create', description: 'Create new partner' },
  { id: 'partner.update', module: 'partner', action: 'update', description: 'Modify partner details' },
  { id: 'partner.delete', module: 'partner', action: 'delete', description: 'Delete partner' },

  // System Module
  { id: 'system.config', module: 'system', action: 'config', description: 'Access global preferences and business info' },
  { id: 'system.audit', module: 'system', action: 'audit', description: 'Access system audit logs in professional mode' },
  { id: 'system.backup', module: 'system', action: 'backup', description: 'Manage database exports and cloud backups' },
];

// 2. Default System Roles
const DEFAULT_ROLES: Role[] = [
  {
    id: 'superadmin',
    name: 'Super Admin',
    description: 'Full administrative access. Automatically possesses all system permissions.',
    permissions: DEFAULT_PERMISSIONS.map(p => p.id),
    isSystem: true
  },
  {
    id: 'admin',
    name: 'Admin',
    description: 'Administrative access. Full content and user management. Cannot access advanced system configuration.',
    permissions: DEFAULT_PERMISSIONS.filter(p => !['system.config', 'system.backup'].includes(p.id)).map(p => p.id),
    isSystem: true
  },
  {
    id: 'manager',
    name: 'Manager',
    description: 'User management and content control (products, parts, jobs). No role editing or system access.',
    permissions: DEFAULT_PERMISSIONS.filter(p => p.module !== 'role' && p.module !== 'permission' && p.module !== 'system').map(p => p.id),
    isSystem: true
  },
  {
    id: 'editor',
    name: 'Editor',
    description: 'Control content (products, purchases, sales, location, supplier, partner) only. Cannot manage users, roles, or system configurations.',
    permissions: [
      'product.view', 'product.create', 'product.update', 'product.disassemble',
      'purchase.view', 'purchase.create', 'purchase.update',
      'sale.view', 'sale.create', 'sale.update',
      'location.view', 'location.create', 'location.update',
      'supplier.view', 'supplier.create', 'supplier.update',
      'partner.view', 'partner.create', 'partner.update'
    ],
    isSystem: true
  },
  {
    id: 'viewer',
    name: 'Viewer',
    description: 'Read-only view permissions across products, inventory, and repair history. No editing privileges.',
    permissions: ['product.view', 'purchase.view', 'sale.view', 'location.view', 'supplier.view', 'partner.view'],
    isSystem: true
  },
  {
    id: 'user',
    name: 'User',
    description: 'Standard system user with basic operation access.',
    permissions: ['product.view', 'purchase.view', 'sale.view', 'location.view', 'supplier.view', 'partner.view'],
    isSystem: true
  }
];

// Initial mock audit logs
const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log-1',
    timestamp: new Date(Date.now() - 3600000 * 24).toISOString(),
    userId: 'system',
    userEmail: 'system@repairflow.io',
    action: 'SYSTEM_START',
    details: 'RBAC Core initialized with default enterprise schemas and default mappings.',
    ipAddress: '127.0.0.1'
  },
  {
    id: 'log-2',
    timestamp: new Date(Date.now() - 3600000 * 3).toISOString(),
    userId: 'a60e74f4-ddfc-41bb-ac0a-79212cb9f99c',
    userEmail: 'pichethneou@gmail.com',
    action: 'USER_LOGIN',
    details: 'User pichethneou@gmail.com logged in successfully with Super Admin permissions.',
    ipAddress: '192.168.1.100'
  }
];

const STORAGE_KEYS = {
  ROLES: 'repair_flow_rbac_roles',
  PERMISSIONS: 'repair_flow_rbac_permissions',
  AUDIT_LOGS: 'repair_flow_rbac_audit_logs',
};

// Helper: Get from local storage
function getStorageItem<T>(key: string, fallback: T): T {
  const data = localStorage.getItem(key);
  if (!data) return fallback;
  try {
    return JSON.parse(data) as T;
  } catch {
    return fallback;
  }
}

// Helper: Save to local storage
function setStorageItem<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// Master email matching auth.ts
const MASTER_ADMIN_EMAIL = 'pichethneou@gmail.com';

export const rbacService = {
  // --- DATABASE SYNC ---

  async reset_to_defaults(): Promise<void> {
    setStorageItem(STORAGE_KEYS.ROLES, DEFAULT_ROLES);
    setStorageItem(STORAGE_KEYS.PERMISSIONS, DEFAULT_PERMISSIONS);
    await this.saveToDatabase(DEFAULT_ROLES, DEFAULT_PERMISSIONS);
    this.add_audit_log('system', 'RBAC_RESET', 'Restored all role-based security configurations to factory defaults.');
  },

  async syncFromDatabase(): Promise<void> {
    try {
      const docRef = doc(db, 'products', 'SYSTEM_RBAC_CONFIG');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data && data.adminNote) {
          try {
            const parsed = JSON.parse(data.adminNote);
            if (parsed && Array.isArray(parsed.roles)) {
              setStorageItem(STORAGE_KEYS.ROLES, parsed.roles);
            }
            if (parsed && Array.isArray(parsed.permissions)) {
              setStorageItem(STORAGE_KEYS.PERMISSIONS, parsed.permissions);
            }
            console.log('Successfully synced RBAC matrix from database.');
          } catch (parseErr) {
            console.error('Failed to parse database RBAC JSON:', parseErr);
          }
        }
      } else {
        console.log('RBAC config not found in database. Initializing with defaults...');
        const currentRoles = this.get_roles();
        const currentPermissions = this.get_permissions();
        await this.saveToDatabase(currentRoles, currentPermissions);
      }
    } catch (dbErr) {
      console.error('Error in syncFromDatabase:', dbErr);
    }
  },

  async saveToDatabase(roles: Role[], permissions: Permission[]): Promise<void> {
    try {
      const configJson = JSON.stringify({ roles, permissions });
      const docRef = doc(db, 'products', 'SYSTEM_RBAC_CONFIG');
      await setDoc(docRef, {
        id: 'SYSTEM_RBAC_CONFIG',
        type: 'System',
        name: 'System RBAC Config',
        serial: 'SYSTEM_RBAC_CONFIG_SERIAL',
        status: 'System',
        reason: 'System Configuration',
        adminNote: configJson
      });
      console.log('Successfully saved RBAC matrix to database.');
    } catch (dbErr) {
      console.error('Error in saveToDatabase:', dbErr);
      throw dbErr;
    }
  },

  async update_roles_matrix(updatedRoles: Role[], operatorId: string = 'system'): Promise<void> {
    setStorageItem(STORAGE_KEYS.ROLES, updatedRoles);
    await this.saveToDatabase(updatedRoles, this.get_permissions());
    const isAuditingEnabled = localStorage.getItem('repair_flow_enterprise_auditing') === 'true';
    if (isAuditingEnabled) {
      this.add_audit_log(
        operatorId,
        'RBAC_MATRIX_SAVE',
        `Saved changes to modular security matrix.`
      );
    }
  },

  // --- READS ---
  
  get_permissions(): Permission[] {
    const permissions = getStorageItem<Permission[]>(STORAGE_KEYS.PERMISSIONS, DEFAULT_PERMISSIONS);
    const missingPermissions = DEFAULT_PERMISSIONS.filter(dp => !permissions.some(p => p.id === dp.id));
    if (missingPermissions.length > 0) {
      const merged = [...permissions, ...missingPermissions];
      setStorageItem(STORAGE_KEYS.PERMISSIONS, merged);
      return merged;
    }
    return permissions;
  },

  get_roles(): Role[] {
    const roles = getStorageItem<Role[]>(STORAGE_KEYS.ROLES, DEFAULT_ROLES);
    const missingSystemRoles = DEFAULT_ROLES.filter(dr => !roles.some(r => r.id === dr.id));
    if (missingSystemRoles.length > 0) {
      const merged = [...roles, ...missingSystemRoles];
      setStorageItem(STORAGE_KEYS.ROLES, merged);
      return merged;
    }
    return roles;
  },

  get_audit_logs(): AuditLog[] {
    return getStorageItem<AuditLog[]>(STORAGE_KEYS.AUDIT_LOGS, INITIAL_AUDIT_LOGS);
  },

  // --- MUTATIONS ---

  async create_permission(module: string, action: string, description: string, operatorId: string = 'system'): Promise<Permission> {
    const id = `${module.toLowerCase()}.${action.toLowerCase()}`;
    const permissions = this.get_permissions();
    
    if (permissions.some(p => p.id === id)) {
      throw new Error(`Permission with ID "${id}" already exists.`);
    }

    const newPermission: Permission = { id, module, action, description };
    setStorageItem(STORAGE_KEYS.PERMISSIONS, [...permissions, newPermission]);
    
    // Auto-grant to Super Admin
    const roles = this.get_roles();
    const updatedRoles = roles.map(r => {
      if (r.id === 'superadmin') {
        return { ...r, permissions: [...r.permissions, id] };
      }
      return r;
    });
    setStorageItem(STORAGE_KEYS.ROLES, updatedRoles);

    this.add_audit_log(operatorId, 'PERMISSION_CREATE', `Created custom permission: "${id}"`);
    await this.saveToDatabase(updatedRoles, [...permissions, newPermission]);
    return newPermission;
  },

  async create_role(name: string, description: string, permissionsList: string[], operatorId: string = 'system'): Promise<Role> {
    const roles = this.get_roles();
    const id = 'role_' + Date.now();
    
    if (roles.some(r => r.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Role with name "${name}" already exists.`);
    }

    const newRole: Role = {
      id,
      name,
      description,
      permissions: permissionsList,
      isSystem: false
    };

    const updatedRoles = [...roles, newRole];
    setStorageItem(STORAGE_KEYS.ROLES, updatedRoles);
    this.add_audit_log(operatorId, 'ROLE_CREATE', `Created custom security role: "${name}"`);
    await this.saveToDatabase(updatedRoles, this.get_permissions());
    return newRole;
  },

  async update_role(roleId: string, updates: Partial<Omit<Role, 'id' | 'isSystem'>>, operatorId: string = 'system'): Promise<Role> {
    const roles = this.get_roles();
    const roleIndex = roles.findIndex(r => r.id === roleId);

    if (roleIndex === -1) {
      throw new Error(`Role with ID "${roleId}" not found.`);
    }

    const currentRole = roles[roleIndex];
    const updatedRole: Role = {
      ...currentRole,
      ...updates,
      // Maintain immutability of system settings
      id: currentRole.id,
      isSystem: currentRole.isSystem
    };

    const newRoles = [...roles];
    newRoles[roleIndex] = updatedRole;
    setStorageItem(STORAGE_KEYS.ROLES, newRoles);

    this.add_audit_log(
      operatorId, 
      'ROLE_UPDATE', 
      `Updated role: "${updatedRole.name}". Changes: ${JSON.stringify(updates)}`
    );
    await this.saveToDatabase(newRoles, this.get_permissions());
    return updatedRole;
  },

  async delete_role(roleId: string, operatorId: string = 'system'): Promise<void> {
    const roles = this.get_roles();
    const roleToDelete = roles.find(r => r.id === roleId);

    if (!roleToDelete) {
      throw new Error(`Role with ID "${roleId}" not found.`);
    }

    if (roleToDelete.isSystem) {
      throw new Error(`Cannot delete built-in system role: "${roleToDelete.name}".`);
    }

    const updatedRoles = roles.filter(r => r.id !== roleId);
    setStorageItem(STORAGE_KEYS.ROLES, updatedRoles);
    this.add_audit_log(operatorId, 'ROLE_DELETE', `Deleted custom security role: "${roleToDelete.name}"`);
    await this.saveToDatabase(updatedRoles, this.get_permissions());
  },

  async clone_role(roleId: string, newName: string, operatorId: string = 'system'): Promise<Role> {
    const roles = this.get_roles();
    const sourceRole = roles.find(r => r.id === roleId);

    if (!sourceRole) {
      throw new Error(`Source role with ID "${roleId}" not found.`);
    }

    if (roles.some(r => r.name.toLowerCase() === newName.toLowerCase())) {
      throw new Error(`Role with name "${newName}" already exists.`);
    }

    const newId = 'role_' + Date.now();
    const newRole: Role = {
      id: newId,
      name: newName,
      description: `Clone of ${sourceRole.name}. ${sourceRole.description}`,
      permissions: [...sourceRole.permissions],
      isSystem: false
    };

    const updatedRoles = [...roles, newRole];
    setStorageItem(STORAGE_KEYS.ROLES, updatedRoles);
    this.add_audit_log(operatorId, 'ROLE_CLONE', `Cloned role "${sourceRole.name}" into "${newName}"`);
    await this.saveToDatabase(updatedRoles, this.get_permissions());
    return newRole;
  },

  async bulk_assign_permissions(roleId: string, permissionsList: string[]): Promise<Role> {
    return await this.update_role(roleId, { permissions: permissionsList });
  },

  assign_role_to_user(userId: string, roleName: string, operatorId: string = 'system'): void {
    // Audit logs for user role changes
    this.add_audit_log(
      operatorId, 
      'USER_ROLE_ASSIGN', 
      `Assigned role "${roleName}" to user account ID: ${userId}`
    );
  },

  // --- CORE CHECKERS ---

  check_permission(user: any, permissionId: string): boolean {
    if (!user) return false;
    
    // Master email bypass
    if (user.email?.toLowerCase() === MASTER_ADMIN_EMAIL) {
      return true;
    }

    const roleName = (user.role || '').toLowerCase();
    const roles = this.get_roles();
    
    // Find role in registered roles case-insensitively for ID and Name
    const userRole = roles.find(r => r.id.toLowerCase() === roleName || r.name.toLowerCase() === roleName);
    
    if (!userRole) {
      // Default fallback roles check
      if (roleName === 'superadmin') return true;
      return false;
    }

    return userRole.permissions.includes(permissionId);
  },

  authorize_action(user: any, permissionId: string): boolean {
    const isAuthorized = this.check_permission(user, permissionId);
    if (!isAuthorized) {
      console.warn(`Access Denied: User ${user?.email || 'Guest'} attempted unauthorized action: ${permissionId}`);
    }
    return isAuthorized;
  },

  add_audit_log(userId: string, action: string, details: string): void {
    const logs = this.get_audit_logs();
    const newLog: AuditLog = {
      id: 'log-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      timestamp: new Date().toISOString(),
      userId,
      userEmail: userId === 'system' ? 'system@repairflow.io' : (userId.includes('@') ? userId : 'admin@repairflow.io'),
      action,
      details,
      ipAddress: '192.168.1.' + Math.floor(Math.random() * 254 + 1)
    };
    
    // Cap logs at 100 entries for local storage size safety
    setStorageItem(STORAGE_KEYS.AUDIT_LOGS, [newLog, ...logs].slice(0, 100));
  }
};
