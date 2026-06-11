import SupabaseService from './SupabaseService';

interface UserInfo {
    sub: string;
    email: string;
    name: string;
    picture?: string;
}

interface AuthState {
    user: UserInfo | null;
    token: string | null;
    isLoggedIn: boolean;
}

let nonce = '';

const AuthService = {
    /**
     * Decode JWT token to extract user info directly from the token payload
     */
    decodeJwt: (token: string): Record<string, any> | null => {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) return null;

            // Decodificar Base64 de forma segura en el navegador
            const base64Url = parts[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
                return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
            }).join(''));

            return JSON.parse(jsonPayload);
        } catch (error) {
            console.error('AuthService: Error decoding JWT:', error);
            return null;
        }
    },
    getGoogleClientId: (): string | undefined => {
        const manifest = chrome.runtime.getManifest();
        return manifest.oauth2?.client_id;
    },
    getGoogleIdToken: async (): Promise<string | null> => {
        console.log('AuthService: Requesting id_token via WebAuthFlow...');

        const googleClientId = AuthService.getGoogleClientId();
        
        if (!googleClientId) {
            console.error('AuthService: No se pudo leer el client_id del manifest.json');
            return null;
        }

        const redirectUrl = chrome.identity.getRedirectURL();
        console.log("EL URL QUE TENÉS QUE COPIAR EN GOOGLE ES:", redirectUrl);

        nonce = crypto.randomUUID();
        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.append('client_id', googleClientId);
        authUrl.searchParams.append('response_type', 'id_token');
        authUrl.searchParams.append('scope', 'openid email profile');
        authUrl.searchParams.append('redirect_uri', redirectUrl);
        authUrl.searchParams.append('nonce', nonce);
        authUrl.searchParams.append('prompt', 'select_account'); // Fuerza a mostrar el selector de cuentas

        return new Promise<string | null>((resolve) => {
            chrome.identity.launchWebAuthFlow(
                { url: authUrl.toString(), interactive: true },
                (responseUrl: string | undefined) => {
                    if (chrome.runtime.lastError || !responseUrl) {
                        console.error('AuthService: launchWebAuthFlow error:', chrome.runtime.lastError);
                        resolve(null);
                        return;
                    }

                    try {
                        const url = new URL(responseUrl);
                        const idToken = url.hash.split('id_token=')[1]?.split('&')[0];

                        if (idToken) {
                            resolve(idToken);
                        } else {
                            console.error('AuthService: id_token not found in response payload');
                            resolve(null);
                        }
                    } catch (error) {
                        console.error('AuthService: Error parsing id_token from response:', error);
                        resolve(null);
                    }
                }
            );
        });
    },

    /**
     * Login with Google -> Decode Token -> Authenticate Supabase
     */
    login: async (): Promise<UserInfo | null> => {
        try {
            // 1. Obtener el JWT puro
            const token = await AuthService.getGoogleIdToken();
            if (!token) return null;

            // 2. Extraer los datos del usuario directamente del token (Sin pegarle a la API)
            const decodedToken = AuthService.decodeJwt(token);
            if (!decodedToken) return null;

            const userInfo: UserInfo = {
                sub: decodedToken.sub,
                email: decodedToken.email,
                name: decodedToken.name,
                picture: decodedToken.picture
            };

            // 3. Autenticar Supabase con el JWT
            try {
                const supabaseClient = SupabaseService.getClient();

                const { error: authError } = await supabaseClient.auth.signInWithIdToken({
                    provider: 'google',
                    token: token,
                    nonce: nonce
                });

                if (authError) {
                    console.error('AuthService: Could not authenticate with Supabase:', authError.message);
                    return null; // Bloqueamos el login local si Supabase lo rechaza
                }

                console.log('AuthService: Supabase client authenticated successfully');
            } catch (supabaseAuthError) {
                console.error('AuthService: Error setting up Supabase auth:', supabaseAuthError);
                return null;
            }

            // 4. Guardar sesión
            const authState: AuthState = {
                user: userInfo,
                token: token,
                isLoggedIn: true
            };

            await chrome.storage.local.set({ authState });
            console.log('AuthService: Login successful. User:', userInfo.name);

            return userInfo;
        } catch (error) {
            console.error('AuthService: Login error:', error);
            return null;
        }
    },

    /**
     * Logout user - Clears Supabase session and local storage
     */
    logout: async (): Promise<void> => {
        try {
            // Desconectar Supabase
            try {
                const supabaseClient = SupabaseService.getClient();
                await supabaseClient.auth.signOut();
                console.log('AuthService: Signed out from Supabase');
            } catch (supabaseError) {
                console.warn('AuthService: Error signing out from Supabase:', supabaseError);
            }

            // Limpiar caché local de la extensión
            chrome.storage.local.remove('authState');
            console.log('AuthService: Logout successful');
        } catch (error) {
            console.error('AuthService: Logout error:', error);
        }
    },

    /**
     * Get stored auth state
     */
    getStoredAuthState: async (): Promise<AuthState> => {
        return new Promise((resolve) => {
            chrome.storage.local.get('authState', (result) => {
                const authState = result.authState as AuthState | undefined;
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