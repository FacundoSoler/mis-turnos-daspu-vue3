import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import AuthService from '../services/AuthService';
import SupabaseService from '../services/SupabaseService';
import type { UserInfo } from '../services/AuthService';

export const useAuthStore = defineStore('auth', () => {
    const user = ref<UserInfo | null>(null);
    const isLoggedIn = ref(false);
    const isLoading = ref(false);

    const isAuthenticated = computed(() => isLoggedIn.value && user.value !== null);

    /**
     * Initialize auth state from storage and restore Supabase session if available
     */
    const initializeAuth = async () => {
        const authState = await AuthService.getStoredAuthState();
        user.value = authState.user;
        isLoggedIn.value = authState.isLoggedIn;

        // If user was previously logged in, restore Supabase session with their token
        if (authState.isLoggedIn && authState.token) {
            try {
                const supabaseClient = SupabaseService.getClient();
                const { error } = await supabaseClient.auth.signInWithIdToken({
                    provider: 'google',
                    token: authState.token
                });

                if (error) {
                    console.warn('useAuthStore: Could not restore Supabase session:', error.message);
                } else {
                    console.log('useAuthStore: Supabase session restored');
                }
            } catch (supabaseError) {
                console.warn('useAuthStore: Error restoring Supabase session:', supabaseError);
            }
        }
    };

    /**
     * Login with Google
     */
    const login = async () => {
        isLoading.value = true;
        try {
            const userInfo = await AuthService.login();
            if (userInfo) {
                user.value = userInfo;
                isLoggedIn.value = true;
                return true;
            }
            return false;
        } finally {
            isLoading.value = false;
        }
    };

    /**
     * Logout
     */
    const logout = async () => {
        isLoading.value = true;
        try {
            await AuthService.logout();
            user.value = null;
            isLoggedIn.value = false;
        } finally {
            isLoading.value = false;
        }
    };

    return {
        user,
        isLoggedIn,
        isLoading,
        isAuthenticated,
        initializeAuth,
        login,
        logout
    };
});
