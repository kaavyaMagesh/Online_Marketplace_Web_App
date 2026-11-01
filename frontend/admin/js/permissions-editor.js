document.addEventListener('DOMContentLoaded', async () => {
    const select = document.getElementById('permission-admin-select');
    const container = document.getElementById('permission-checkboxes');
    const saveButton = document.getElementById('save-admin-permissions');
    const message = document.getElementById('permission-save-message');

    if (!select || !container || !saveButton) return;

    const availablePermissions = [
        'manage_customers',
        'manage_sellers',
        'manage_products',
        'manage_categories'
    ];

    let admins = [];

    function showMessage(text, isError = false) {
        message.textContent = text;
        message.style.color = isError ? '#dc2626' : '#15803d';
    }

    function renderPermissions() {
        container.replaceChildren();

        const admin = admins.find(
            a => String(a.user_id) === select.value
        );

        if (!admin) {
            saveButton.disabled = true;
            return;
        }

        saveButton.disabled = false;

        for (const permission of availablePermissions) {
            const label = document.createElement('label');
            label.style.display = 'flex';
            label.style.alignItems = 'center';
            label.style.gap = '10px';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = permission;
            checkbox.checked = (admin.permissions || []).includes(permission);

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(
                permission.replaceAll('_', ' ')
            ));

            container.appendChild(label);
        }
    }

    async function loadAdmins() {
        const response = await fetch('/api/superadmin/admins', {
            credentials: 'same-origin'
        });

        if (!response.ok) {
            throw new Error('Unable to retrieve administrators.');
        }

        const data = await response.json();

        admins = (data.admins || []).filter(
            admin => admin.role === 'admin'
        );

        select.replaceChildren();

        const placeholder = document.createElement('option');
        placeholder.value = '';
        placeholder.textContent = 'Select an administrator';
        select.appendChild(placeholder);

        for (const admin of admins) {
            const option = document.createElement('option');
            option.value = admin.user_id;
            option.textContent = `${admin.name} (${admin.email})`;
            select.appendChild(option);
        }

        renderPermissions();
    }

    select.addEventListener('change', () => {
        showMessage('');
        renderPermissions();
    });

    saveButton.addEventListener('click', async () => {
        const adminId = Number(select.value);
        if (!adminId) return;

        const permissions = Array.from(
            container.querySelectorAll('input[type="checkbox"]:checked')
        ).map(checkbox => checkbox.value);

        saveButton.disabled = true;
        showMessage('Saving permissions...');

        try {
            const response = await fetch(
                `/api/superadmin/permissions/${adminId}`,
                {
                    method: 'PUT',
                    credentials: 'same-origin',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ permissions })
                }
            );

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to update permissions.');
            }

            showMessage('Permissions updated successfully.');

            await loadAdmins();
            select.value = String(adminId);
            renderPermissions();

            if (typeof loadSuperPermissions === 'function') {
                await loadSuperPermissions();
            }

            if (typeof loadSuperAdmins === 'function') {
                await loadSuperAdmins();
            }

        } catch (error) {
            showMessage(error.message, true);
        } finally {
            saveButton.disabled = false;
        }
    });

    try {
        await loadAdmins();
    } catch (error) {
        showMessage(error.message, true);
        saveButton.disabled = true;
    }
});
