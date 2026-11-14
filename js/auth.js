// ===== Auth =====

function loginWithGoogle() {
    window.location.href = `${API_BASE_URL}/auth/google/login`;
}

function loginWithSpotify() {
    window.location.href = `${API_BASE_URL}/auth/spotify/login`;
}

function loginWithApple() {
    window.location.href = `${API_BASE_URL}/auth/apple/login`;
}

function getAuthHeaders() {
    if (!authToken) return {};
    return { 'Authorization': `Bearer ${authToken}` };
}

function logout() {
    authToken = null;
    currentUser = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('login_type');
    window.location.reload();
}

async function checkAuth() {
    // URL에서 토큰 파라미터 확인 (Google OAuth 콜백 후)
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    if (token) {
        authToken = token;
        localStorage.setItem('auth_token', token);
        window.history.replaceState({}, '', window.location.pathname);
    }

    if (!authToken) return;

    try {
        const res = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: getAuthHeaders()
        });
        if (res.ok) {
            currentUser = await res.json();
            localStorage.setItem('login_type', currentUser.login_type || 'google');
            console.log('✅ Logged in as:', currentUser.email);
        } else {
            authToken = null;
            localStorage.removeItem('auth_token');
            localStorage.removeItem('login_type');
        }
    } catch (e) {
        console.error('Auth check failed:', e);
    }
}

function continueAsGuest() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('initialSongInput').classList.remove('hidden');
    document.getElementById('sideBar')?.classList.remove('hidden');
    document.getElementById('bottomTab').classList.remove('hidden');
}

function _renderSettingsProfile() {
    if (!currentUser) return;
    const img = document.getElementById('settingsProfileImg');
    const name = document.getElementById('settingsProfileName');
    const email = document.getElementById('settingsProfileEmail');
    if (img) img.src = currentUser.profile_image_url || '';
    if (name) name.textContent = currentUser.display_name || '';
    if (email) email.textContent = currentUser.email || '';
}
