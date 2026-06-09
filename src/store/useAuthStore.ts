import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import AuthService from '../services/AuthService';
import type { UserInfo } from '../services/AuthService';

export const useAuthStore = defineStore('auth', () => {
    const user = ref<UserInfo | null>(null);
    const isLoggedIn = ref(false);
    const isLoading = ref(false);

    const isAuthenticated = computed(() => isLoggedIn.value && user.value !== null);

    /**
     * Initialize auth state from storage
     */
    const initializeAuth = async () => {
        const authState = await AuthService.getStoredAuthState();
        user.value = authState.user;
        isLoggedIn.value = authState.isLoggedIn;
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
