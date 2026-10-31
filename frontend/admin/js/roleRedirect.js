
function redirectByRole(user) {
    if (!user || user.status !== 'active') {
        return false;
    }

    const destinations = {
        admin: '/admin/dashboard.html',
        super_admin: '/admin/super-dashboard.html'
    };

    const destination = destinations[user.role];

    if (!destination) {
        return false;
    }

    window.location.assign(destination);
    return true;
}
