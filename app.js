getElementById('dashboardSection').style.display = 'block';
            if (!silent) alert(`Welcome ${currentUser.username}!`);
            fetchFiles();
        } else {
            alert('Login failed');
        }
    } catch (e) {
        console.error(e);
        alert('Cannot connect to server. Make sure Worker is deployed.');
    }
}

function logout() {
    currentUser = null;
    localStorage.removeItem('gofile_user');
    document.getElementById('userDisplay').innerText = 'guest9122398228';
    document.getElementById('authBtn').innerText = 'Add Account';
    document.getElementById('dashboardSection').style.display = 'none';
    document.getElementById('fileTableBody').innerHTML = '';
}

async function uploadFiles(files) {
    const progress = document.getElementById('uploadProgress');
    progress.style.display = 'block';
    for (let file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('username', currentUser.username);
        try {
            const res = await fetch(`${WORKER_URL}/upload`, { 
                method: 'POST', 
                body: formData 
            });
            const data = await res.json();
            if (data.success) {
                progress.value = 100;
                fetchFiles();
            } else alert('Upload failed for ' + file.name + ': ' + data.error);
        } catch (e) { alert('Error uploading'); }
        setTimeout(() => { progress.style.display = 'none'; progress.value = 0; }, 1000);
    }
}

async function fetchFiles() {
    if (!currentUser) return;
    const res = await fetch(`${WORKER_URL}/files?username=${currentUser.username}`);
    const files = await res.json();
    const tbody = document.getElementById('fileTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (!Array.isArray(files)) return;
    files.forEach(f => {
        const tr = document.createElement('tr');
        const size = (f.size / 1024 / 1024).toFixed(2) + ' MB';
        const date = new Date(f.uploaded_at).toLocaleDateString();
        tr.innerHTML = `
            <td>${f.name}</td>
            <td>${size}</td>
            <td>${date}</td>
            <td>
                <a href="${WORKER_URL}/download/${f.id}?username=${currentUser.username}" target="_blank">⬇ Download</a>
                <span class="delete-btn" onclick="deleteFile('${f.id}')">🗑 Delete</span>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteFile(id) {
    if (!confirm('Delete this file?')) return;
    const res = await fetch(`${WORKER_URL}/delete/${id}?username=${currentUser.username}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) fetchFiles();
    else alert('Delete failed');
}
