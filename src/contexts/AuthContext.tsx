import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
  createUserWithEmailAndPassword
} from 'firebase/auth';
import { ref, set, get, onValue } from 'firebase/database';
import { database } from '@/config/firebase';
import { User, UserPermissions, DEFAULT_ADMIN_PERMISSIONS } from '@/types/auth';
import { toast } from '@/hooks/use-toast';

interface AuthContextType {
  currentUser: User | null;
  firebaseUser: FirebaseUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasPermission: (permission: keyof UserPermissions) => boolean;
  canAccessBuilding: (buildingId: string) => boolean;
  createUser: (email: string, password: string, displayName: string, role: 'admin' | 'user', permissions: UserPermissions, buildingAccess: string[]) => Promise<void>;
  updateUserPermissions: (uid: string, permissions: Partial<UserPermissions>) => Promise<void>;
  updateUserBuildingAccess: (uid: string, buildingAccess: string[]) => Promise<void>;
  updateUserRole: (uid: string, role: 'admin' | 'user') => Promise<void>;
  toggleUserStatus: (uid: string, isActive: boolean) => Promise<void>;
  deleteUser: (uid: string) => Promise<void>;
  getAllUsers: () => Promise<User[]>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const auth = getAuth();
  const userListenerUnsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);

      // Always clear previous DB listener when auth user changes
      if (userListenerUnsubRef.current) {
        userListenerUnsubRef.current();
        userListenerUnsubRef.current = null;
      }
      
      if (user) {
        const userRef = ref(database, `users/${user.uid}`);
        const unsub = onValue(userRef, (snapshot) => {
          // Safety: ensure we're still the same auth user
          if (auth.currentUser?.uid !== user.uid) return;

          const userData = snapshot.val();
          if (userData) {
            setCurrentUser({
              ...userData,
              uid: user.uid,
              email: user.email || userData.email,
              createdAt: new Date(userData.createdAt),
              lastLogin: userData.lastLogin ? new Date(userData.lastLogin) : undefined,
            });
          } else {
            setCurrentUser(null);
          }
          setLoading(false);
        });
        userListenerUnsubRef.current = unsub;
      } else {
        setCurrentUser(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (userListenerUnsubRef.current) {
        userListenerUnsubRef.current();
        userListenerUnsubRef.current = null;
      }
    };
  }, [auth]);

  const signIn = async (email: string, password: string) => {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Check if user exists in database
      const userRef = ref(database, `users/${user.uid}`);
      const snapshot = await get(userRef);
      
      if (!snapshot.exists()) {
        await firebaseSignOut(auth);
        throw new Error('Usuário não encontrado no sistema.');
      }
      
      const userData = snapshot.val();
      
      if (!userData.isActive) {
        await firebaseSignOut(auth);
        throw new Error('Usuário desativado. Entre em contato com o administrador.');
      }
      
      // Update last login
      await set(ref(database, `users/${user.uid}/lastLogin`), new Date().toISOString());
      
      toast({
        title: "Login realizado com sucesso!",
        description: `Bem-vindo, ${userData.displayName}`,
      });
    } catch (error: any) {
      console.error('Error signing in:', error);
      
      let errorMessage = 'Erro ao fazer login';
      
      if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        errorMessage = 'Email ou senha incorretos';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Muitas tentativas. Tente novamente mais tarde';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Erro no login",
        description: errorMessage,
        variant: "destructive",
      });
      
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await firebaseSignOut(auth);
      setCurrentUser(null);
      setFirebaseUser(null);
      
      // Limpar o prédio selecionado ao fazer logout
      await set(ref(database, 'selectedBuilding'), null);
      
      toast({
        title: "Logout realizado",
        description: "Até logo!",
      });
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: "Erro ao fazer logout",
        variant: "destructive",
      });
    }
  };

  const createUser = async (
    email: string, 
    password: string, 
    displayName: string, 
    role: 'admin' | 'user',
    permissions: UserPermissions,
    buildingAccess: string[]
  ) => {
    try {
      // Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Create user data in database
      const userData: Omit<User, 'uid'> = {
        email,
        displayName,
        role,
        permissions,
        buildingAccess,
        createdAt: new Date(),
        isActive: true,
      };
      
      await set(ref(database, `users/${user.uid}`), {
        ...userData,
        createdAt: userData.createdAt.toISOString(),
      });
      
      // Sign out the newly created user and sign back in as admin
      await firebaseSignOut(auth);
      
      toast({
        title: "Usuário criado com sucesso!",
        description: `${displayName} foi adicionado ao sistema.`,
      });
    } catch (error: any) {
      console.error('Error creating user:', error);
      
      let errorMessage = 'Erro ao criar usuário';
      
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'Este email já está cadastrado';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'A senha deve ter pelo menos 6 caracteres';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Email inválido';
      }
      
      toast({
        title: "Erro ao criar usuário",
        description: errorMessage,
        variant: "destructive",
      });
      
      throw error;
    }
  };

  const updateUserPermissions = async (uid: string, permissions: Partial<UserPermissions>) => {
    try {
      const userRef = ref(database, `users/${uid}/permissions`);
      const snapshot = await get(userRef);
      const currentPermissions = snapshot.val() || {};
      
      await set(userRef, {
        ...currentPermissions,
        ...permissions,
      });
      
      toast({
        title: "Permissões atualizadas",
        description: "As permissões do usuário foram atualizadas com sucesso.",
      });
    } catch (error) {
      console.error('Error updating permissions:', error);
      toast({
        title: "Erro ao atualizar permissões",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateUserBuildingAccess = async (uid: string, buildingAccess: string[]) => {
    try {
      await set(ref(database, `users/${uid}/buildingAccess`), buildingAccess);
      
      toast({
        title: "Acesso aos prédios atualizado",
        description: "O acesso aos prédios foi atualizado com sucesso.",
      });
    } catch (error) {
      console.error('Error updating building access:', error);
      toast({
        title: "Erro ao atualizar acesso",
        variant: "destructive",
      });
      throw error;
    }
  };

  const toggleUserStatus = async (uid: string, isActive: boolean) => {
    try {
      await set(ref(database, `users/${uid}/isActive`), isActive);
      
      toast({
        title: isActive ? "Usuário ativado" : "Usuário desativado",
        description: `O usuário foi ${isActive ? 'ativado' : 'desativado'} com sucesso.`,
      });
    } catch (error) {
      console.error('Error toggling user status:', error);
      toast({
        title: "Erro ao alterar status",
        variant: "destructive",
      });
      throw error;
    }
  };

  const updateUserRole = async (uid: string, role: 'admin' | 'user') => {
    try {
      await set(ref(database, `users/${uid}/role`), role);
      
      // If promoting to admin, grant all admin permissions
      if (role === 'admin') {
        await set(ref(database, `users/${uid}/permissions`), DEFAULT_ADMIN_PERMISSIONS);
      }
      
      toast({
        title: "Função atualizada",
        description: `O usuário foi ${role === 'admin' ? 'promovido a administrador' : 'alterado para usuário'}.`,
      });
    } catch (error) {
      console.error('Error updating user role:', error);
      toast({
        title: "Erro ao atualizar função",
        variant: "destructive",
      });
      throw error;
    }
  };

  const deleteUser = async (uid: string) => {
    try {
      // Remove user from database
      await set(ref(database, `users/${uid}`), null);
      
      toast({
        title: "Usuário removido",
        description: "O usuário foi removido do sistema.",
      });
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: "Erro ao remover usuário",
        description: "Não foi possível remover o usuário. Tente novamente.",
        variant: "destructive",
      });
      throw error;
    }
  };

  const getAllUsers = async (): Promise<User[]> => {
    try {
      const usersRef = ref(database, 'users');
      const snapshot = await get(usersRef);
      
      if (!snapshot.exists()) {
        return [];
      }
      
      const usersData = snapshot.val();
      const users: User[] = Object.keys(usersData).map(uid => ({
        uid,
        ...usersData[uid],
        createdAt: new Date(usersData[uid].createdAt),
        lastLogin: usersData[uid].lastLogin ? new Date(usersData[uid].lastLogin) : undefined,
      }));
      
      return users;
    } catch (error) {
      console.error('Error getting users:', error);
      return [];
    }
  };

  const hasPermission = useCallback((permission: keyof UserPermissions): boolean => {
    if (!currentUser) return false;
    return currentUser.permissions[permission] === true;
  }, [currentUser]);

  const canAccessBuilding = useCallback((buildingId: string): boolean => {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    return currentUser.buildingAccess?.includes(buildingId) || false;
  }, [currentUser]);

  const value = {
    currentUser,
    firebaseUser,
    loading,
    signIn,
    signOut,
    hasPermission,
    canAccessBuilding,
    createUser,
    updateUserPermissions,
    updateUserBuildingAccess,
    updateUserRole,
    toggleUserStatus,
    deleteUser,
    getAllUsers,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
