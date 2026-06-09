interface UserInfo {
    sub: string;           // Google's unique identifier
    email: string;
    name: string;
    picture?: string;
}

interface AuthState {
    user: UserInfo | null;
    token: string | null;
    isLoggedIn: boolean;
}

const AuthService = {
    /**
     * Decode JWT token (base64 decode without verification for client-side use)
     * In production, verify the token signature on backend
     */
    decodeJwt: (token: string): Record<string, any> | null => {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;

            const decoded = atob(parts[1]);
            return JSON.parse(decoded);
        } catch (error) {
            console.error('AuthService: Error decoding JWT:', error);
            return null;
        }
    },

    /**
     * Get Google ID token and extract user info
     */
    getGoogleIdToken: async (): Promise<string | null> => {
        return new Promise((resolve) => {
            chrome.identity.getAuthToken({ interactive: true }, (result: any) => {
                if (chrome.runtime.lastError) {
                    console.error('AuthService: Error getting auth token:', chrome.runtime.lastError);
                    resolve(null);
                } else {
                    resolve(result || null);
                }
            });
        });
    },

    /**
     * Exchange access token for ID token and user info
     * Chrome's identity API doesn't directly return ID tokens, so we fetch user info from Google API
     * Handles 401 errors by removing cached token and retrying with fresh token
     */
    fetchUserInfo: async (accessToken: string, retryCount: number = 0): Promise<UserInfo | null> => {
        try {
            const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            // Handle 401 Unauthorized - token might be expired or invalid
            if (response.status === 401 && retryCount === 0) {
                console.warn('AuthService: Token unauthorized (401), clearing cache and retrying...');
                
                // Remove the invalid token from Chrome's cache
                await new Promise<void>((resolve) => {
                    chrome.identity.removeCachedAuthToken({ token: accessToken }, () => {
                        console.log('AuthService: Invalid token removed from cache');
                        resolve();
                    });
                });

                // Get a fresh token
                const freshToken = await AuthService.getGoogleIdToken();
                if (!freshToken) {
                    console.error('AuthService: Failed to get fresh token');
                    return null;
                }

                // Retry fetchUserInfo with fresh token (only once to avoid infinite loop)
                return AuthService.fetchUserInfo(freshToken, 1);
            }

            if (!response.ok) {
                console.error('AuthService: Failed to fetch user info:', response.statusText);
                return null;
            }

            const data = await response.json();
            
            // Log the 'id' field (which is Google's unique identifier equivalent to 'sub')
            console.log('Google User ID (sub equivalent):', data.id);

            return {
                sub: data.id,
                email: data.email,
                name: data.name,
                picture: data.picture
            };
        } catch (error) {
            console.error('AuthService: Error fetching user info:', error);
            return null;
        }
    },

    /**
     * Login with Google
     */
    login: async (): Promise<UserInfo | null> => {
        try {
            const token = await AuthService.getGoogleIdToken();
            if (!token) return null;

            const userInfo = await AuthService.fetchUserInfo(token);
            if (!userInfo) return null;

            // Store in chrome.storage for persistence across popup reopens
            const authState: AuthState = {
                user: userInfo,
                token: token,
                isLoggedIn: true
            };

            await chrome.storage.local.set({ authState });
            console.log('AuthService: Login successful. User:', userInfo.name, 'Sub:', userInfo.sub);

            return userInfo;
        } catch (error) {
            console.error('AuthService: Login error:', error);
            return null;
        }
    },

    /**
     * Logout user - properly revokes and clears cached token
     */
    logout: async (): Promise<void> => {
        try {
            // Get the stored auth state to access the token
            const authState = await AuthService.getStoredAuthState();
            const token = authState.token;

            // Remove cached token from Chrome's identity API
            if (token) {
                await new Promise<void>((resolve) => {
                    chrome.identity.removeCachedAuthToken({ token }, () => {
                        console.log('AuthService: Cached token removed');
                        resolve();
                    });
                });

                // Attempt to revoke the token with Google
                try {
                    await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
                    console.log('AuthService: Token revoked with Google');
                } catch (revokeError) {
                    console.warn('AuthService: Token revocation failed (non-critical):', revokeError);
                }
            }

            // Clear stored auth state
            chrome.storage.local.remove('authState');
            console.log('AuthService: Logout successful');
        } catch (error) {
            console.error('AuthService: Logout error:', error);
        }
    },

    /**
     * Get stored auth state (without making new API calls)
     */
    getStoredAuthState: async (): Promise<AuthState> => {
        return new Promise((resolve) => {
            chrome.storage.local.get('authState', (result) => {
                const authState = result.authState as AuthState | undefined;
                if (authState && authState.token) {
                    console.log('AuthService: Restored auth state from storage');
                }
                resolve(
                    authState || {
                        user: null,
                        token: null,
                        isLoggedIn: false
                    }
                );
            });
        });
    }
};

export default AuthService;
export type { UserInfo, AuthState };
