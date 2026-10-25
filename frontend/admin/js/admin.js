
async function checkAdminAccess() {
    const message = document.getElementById('access-message');

    try {
        const isSuperAdminPage = window.location.pathname === '/admin/super-dashboard.html';
        
        const endpoint = isSuperAdminPage ? '/api/admin/super/check' : '/api/admin/check';
        
        const response = await fetch(endpoint, {
            credentials: 'same-origin'
        });

        if (response.ok) {
            document.body.style.visibility = 'visible';
            return;
        }

        if (message) {
            message.textContent =
                response.status === 401
                    ? 'Please log in to access the Admin Panel.'
                    : 'Access denied. Administrator permissions required.';
        }

        document.body.style.visibility = 'visible';

        const main = document.querySelector('.main-content');
        const sidebar = document.querySelector('.sidebar');

        if (main) main.style.display = 'none';
        if (sidebar) sidebar.style.display = 'none';

    } catch (error) {
        console.error('Authentication check failed:', error);

        if (message) {
            message.textContent =
                'Unable to verify your permissions. Please try again.';
        }

        document.body.style.visibility = 'visible';

        const main = document.querySelector('.main-content');
        const sidebar = document.querySelector('.sidebar');

        if (main) main.style.display = 'none';
        if (sidebar) sidebar.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', checkAdminAccess);
