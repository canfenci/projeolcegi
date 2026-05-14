const db = new Dexie("CanfenciPWA_DB");
db.version(1).stores({
    students: '++id, firstName, lastName, classLevel, section, number',
    tasks: '++id, studentId, subject, topic, deadline, isSubmitted, tags',
    criteria: '++id, name'
});

let currentSelectedStudentId = null; 
let currentReportType = 'individual'; 
let globalBulkReportFilter = ''; 
let globalBulkClassFilter = 'all'; // Seçilen sınıfın filtresi (Örn: 5/D)

async function initDB() {
    const count = await db.criteria.count();
    if (count === 0) {
        const defaults = [
            "Planlama", "Kaynak Kullanımı", "Yaratıcılık", "Ürün Kalitesi", "Zaman Yönetimi", 
            "Görev Bilinci", "İşbirliği", "Araştırma Derinliği", "Teknik Beceri", "Genel Etki"
        ];
        for (let name of defaults) await db.criteria.add({ name });
    }
}

function setupEventListeners() {
    document.getElementById('addStudentBtn').addEventListener('click', () => {
        document.getElementById('studentId').value = '';
        document.getElementById('stdName').value = '';
        document.getElementById('stdSurname').value = '';
        document.getElementById('stdClass').value = '';
        document.getElementById('stdSection').value = '';
        document.getElementById('stdNo').value = '';
        document.getElementById('studentModal').classList.remove('hidden');
    });

    document.getElementById('saveStudentBtn').addEventListener('click', async () => {
        const id = document.getElementById('studentId').value;
        const data = {
            firstName: document.getElementById('stdName').value.trim(),
            lastName: document.getElementById('stdSurname').value.trim(),
            classLevel: document.getElementById('stdClass').value,
            section: document.getElementById('stdSection').value,
            number: document.getElementById('stdNo').value.trim()
        };
        
        if (!data.firstName || !data.lastName || !data.classLevel || !data.section) {
            alert('Lütfen öğrenci formundaki zorunlu alanları doldurun!');
            return;
        }

        let newId;
        if (id) {
            newId = Number(id);
            await db.students.update(newId, data);
        } else {
            newId = await db.students.add(data);
        }
        
        document.getElementById('studentModal').classList.add('hidden');
        renderStudents();
        showStudentDetail(newId);
    });

    document.getElementById('backToListBtn').addEventListener('click', () => {
        document.getElementById('studentDetailView').classList.add('hidden');
        document.getElementById('mainListView').classList.remove('hidden');
        currentSelectedStudentId = null;
        renderStudents(); 
    });

    document.getElementById('detailAddTaskBtn').addEventListener('click', () => {
        if(currentSelectedStudentId) openTaskModal(currentSelectedStudentId);
    });

    document.getElementById('detailReportBtn').addEventListener('click', () => {
        if(currentSelectedStudentId) {
            currentReportType = 'individual';
            openReportPreview(currentSelectedStudentId);
        }
    });

    // Sınıf Raporu Butonu Tıklanınca Dinamik Sınıf Listesini Doldur
    document.getElementById('classReportBtn').addEventListener('click', async () => {
        document.getElementById('reportFilterTag').value = '';
        
        const students = await db.students.toArray();
        const classSet = new Set();
        students.forEach(s => classSet.add(`${s.classLevel}/${s.section}`));
        
        const classSelect = document.getElementById('reportClassFilter');
        classSelect.innerHTML = '<option value="all">Tüm Sınıflar (Birlikte)</option>';
        
        Array.from(classSet).sort().forEach(c => {
            classSelect.innerHTML += `<option value="${c}">${c} Sınıfı</option>`;
        });

        document.getElementById('bulkReportFilterModal').classList.remove('hidden');
    });

    document.getElementById('generateFilteredReportBtn').addEventListener('click', () => {
        globalBulkReportFilter = document.getElementById('reportFilterTag').value.trim().toLowerCase();
        globalBulkClassFilter = document.getElementById('reportClassFilter').value;
        document.getElementById('bulkReportFilterModal').classList.add('hidden');
        currentReportType = 'bulk';
        openBulkReportPreview();
    });

    document.getElementById('downloadWordBtn').addEventListener('click', async () => {
        await generateWord();
    });

    document.getElementById('downloadPdfBtn').addEventListener('click', async () => {
        if (currentReportType === 'individual' && currentSelectedStudentId) {
            await generatePDF(currentSelectedStudentId);
        } else if (currentReportType === 'bulk') {
            await generateBulkPDF();
        }
    });

    document.getElementById('darkModeToggle').addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
        localStorage.theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
    });
    if(localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
    }

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.closest('div[id$="Modal"]').classList.add('hidden');
        });
    });

    document.getElementById('settingsBtn').addEventListener('click', () => document.getElementById('settingsModal').classList.remove('hidden'));
    document.getElementById('saveSettingsBtn').addEventListener('click', () => {
        localStorage.setItem('startYear', document.getElementById('startYear').value);
        localStorage.setItem('endYear', document.getElementById('endYear').value);
        localStorage.setItem('schoolName', document.getElementById('schoolName').value);
        localStorage.setItem('principalName', document.getElementById('principalName').value);
        localStorage.setItem('teacherName', document.getElementById('teacherName').value);
        localStorage.setItem('teacherSurname', document.getElementById('teacherSurname').value);
        localStorage.setItem('teacherBranch', document.getElementById('teacherBranch').value);
        document.getElementById('settingsModal').classList.add('hidden');
    });

    document.getElementById('criteriaSettingsBtn').addEventListener('click', () => {
        renderCriteriaList();
        document.getElementById('criteriaModal').classList.remove('hidden');
    });
    
    document.getElementById('addCriteriaBtn').addEventListener('click', async () => {
        const name = document.getElementById('newCriteriaInput').value.trim();
        if(name) {
            await db.criteria.add({ name });
            document.getElementById('newCriteriaInput').value = '';
            renderCriteriaList();
        }
    });

    document.getElementById('saveTaskBtn').addEventListener('click', async () => {
        const rawTags = document.getElementById('taskTags').value.trim();
        if (!rawTags) {
            alert("Lütfen görev için en az bir etiket giriniz! İpucu: Proje, Performans, Sunum vb.");
            return;
        }

        const criteriaData = [];
        document.querySelectorAll('.criteria-input').forEach(input => {
            criteriaData.push({ name: input.dataset.name, score: Number(input.value) });
        });
        
        const data = {
            studentId: Number(document.getElementById('taskStudentId').value),
            subject: document.getElementById('taskSubject').value,
            topic: document.getElementById('taskTopic').value,
            deadline: document.getElementById('taskDeadline').value,
            tags: rawTags.split(',').map(t => t.trim()).filter(t => t),
            isSubmitted: document.querySelector('input[name="isSubmitted"]:checked').value === 'true',
            criteriaDetails: criteriaData,
            totalScore: Number(document.getElementById('taskTotalScore').innerText)
        };
        const id = document.getElementById('taskId').value;
        if (id) await db.tasks.update(Number(id), data);
        else await db.tasks.add(data);
        
        document.getElementById('taskModal').classList.add('hidden');
        
        if (currentSelectedStudentId) renderStudentTasks(currentSelectedStudentId); 
        renderStudents(); 
    });

    document.getElementById('backupBtn').addEventListener('click', async () => {
        const data = {
            students: await db.students.toArray(),
            tasks: await db.tasks.toArray(),
            criteria: await db.criteria.toArray(),
            settings: {...localStorage}
        };
        const blob = new Blob([JSON.stringify(data)], {type: "application/json"});
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Canfenci_Yedek_${new Date().toLocaleDateString('tr-TR')}.json`;
        a.click();
    });

    document.getElementById('restoreFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            if(confirm("Tüm veriler üzerine yazılacak. Onaylıyor musunuz?")) {
                const d = JSON.parse(event.target.result);
                await db.students.clear(); await db.students.bulkAdd(d.students || []);
                await db.tasks.clear(); await db.tasks.bulkAdd(d.tasks || []);
                await db.criteria.clear(); await db.criteria.bulkAdd(d.criteria || []);
                alert("Yedek başarıyla yüklendi!");
                location.reload();
            }
        };
        reader.readAsText(file);
    });

    document.getElementById('searchInput').addEventListener('input', (e) => renderStudents(e.target.value));
}

// ==========================================
// KÜRESEL UI FONKSİYONLARI
// ==========================================

async function renderStudents(filter = '') {
    const list = document.getElementById('studentList');
    list.innerHTML = '';
    let students = await db.students.toArray();
    if(filter) {
        filter = filter.toLowerCase();
        students = students.filter(s => `${s.firstName} ${s.lastName} ${s.number}`.toLowerCase().includes(filter));
    }
    
    for (let s of students) {
        const tasks = await db.tasks.where({studentId: s.id}).toArray();
        const card = document.createElement('div');
        card.className = "bg-white dark:bg-gray-800 p-5 rounded-lg shadow cursor-pointer border-l-4 border-blue-500 hover:shadow-lg transition-shadow";
        card.onclick = () => showStudentDetail(s.id);
        
        card.innerHTML = `
            <div class="flex justify-between items-start border-b pb-3 mb-3 dark:border-gray-700">
                <div>
                    <h3 class="font-bold text-lg text-gray-800 dark:text-white">${s.number} - ${s.firstName} ${s.lastName}</h3>
                    <p class="text-sm text-gray-500">${s.classLevel}. Sınıf / ${s.section} Şubesi</p>
                </div>
                <div class="flex gap-2">
                    <button onclick="event.stopPropagation(); editStudent(${s.id})" class="text-blue-500 hover:bg-blue-100 dark:hover:bg-gray-700 p-2 rounded transition"><i class="fas fa-edit"></i></button>
                    <button onclick="event.stopPropagation(); deleteStudent(${s.id})" class="text-red-500 hover:bg-red-100 dark:hover:bg-gray-700 p-2 rounded transition"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="flex justify-between items-center">
                <p class="text-sm text-gray-600 dark:text-gray-400 font-medium">Kayıtlı Görev: <span class="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 py-0.5 px-2 rounded-full text-xs">${tasks.length}</span></p>
                <span class="text-xs text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">Görevleri Gör <i class="fas fa-chevron-right"></i></span>
            </div>`;
        list.appendChild(card);
    }
}

window.showStudentDetail = async (id) => {
    currentSelectedStudentId = id;
    const s = await db.students.get(id);
    
    document.getElementById('mainListView').classList.add('hidden');
    document.getElementById('studentDetailView').classList.remove('hidden');
    
    document.getElementById('detailStudentName').innerText = `${s.number} - ${s.firstName} ${s.lastName}`;
    document.getElementById('detailStudentInfo').innerText = `${s.classLevel}. Sınıf / ${s.section} Şubesi`;
    
    renderStudentTasks(id);
};

async function renderStudentTasks(sid) {
    const list = document.getElementById('studentTaskList');
    list.innerHTML = '';
    const tasks = await db.tasks.where({studentId: sid}).toArray();
    
    if (tasks.length === 0) {
        list.innerHTML = `<div class="col-span-full p-6 text-center text-gray-500 bg-white dark:bg-gray-800 rounded shadow"><i class="fas fa-box-open text-4xl mb-3 opacity-50"></i><p>Bu öğrenci için henüz kaydedilmiş bir görev bulunmuyor.</p></div>`;
        return;
    }

    tasks.forEach(t => {
        const card = document.createElement('div');
        card.className = "bg-white dark:bg-gray-800 p-4 rounded shadow border border-gray-200 dark:border-gray-700 flex flex-col justify-between";
        card.innerHTML = `
            <div class="flex justify-between items-start mb-3">
                <div>
                    <h4 class="font-bold text-lg text-gray-800 dark:text-gray-100">${t.topic}</h4>
                    <p class="text-sm font-medium text-blue-600 dark:text-blue-400">${t.subject} <span class="text-gray-500 dark:text-gray-400 font-normal">| Etiket: ${t.tags.join(', ')}</span></p>
                </div>
                <div class="flex gap-1">
                    <button onclick="editTask(${t.id})" class="text-blue-500 hover:bg-blue-50 dark:hover:bg-gray-700 p-2 rounded transition"><i class="fas fa-edit"></i></button>
                    <button onclick="deleteTask(${t.id})" class="text-red-500 hover:bg-red-50 dark:hover:bg-gray-700 p-2 rounded transition"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div class="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Son Teslim: <span class="font-semibold text-gray-800 dark:text-gray-200">${t.deadline}</span>
            </div>
            <div class="flex justify-between items-center mt-auto border-t dark:border-gray-700 pt-3">
                <span class="text-sm ${t.isSubmitted ? 'text-green-600 dark:text-green-400 font-bold' : 'text-red-600 dark:text-red-400 font-bold'}">
                    <i class="${t.isSubmitted ? 'fas fa-check-circle' : 'fas fa-times-circle'}"></i> ${t.isSubmitted ? 'Teslim Etti' : 'Etmedi'}
                </span>
                <span class="font-bold text-lg text-gray-800 dark:text-white">Puan: ${t.totalScore}</span>
            </div>
        `;
        list.appendChild(card);
    });
}

window.deleteStudent = async (id) => {
    if(confirm("Bu öğrenciyi ve tüm görevlerini silmek istediğinize emin misiniz?")) {
        await db.tasks.where({studentId: id}).delete();
        await db.students.delete(id);
        renderStudents();
    }
};

window.deleteTask = async (id) => {
    if(confirm("Bu görevi silmek istediğinize emin misiniz?")) {
        await db.tasks.delete(id);
        if(currentSelectedStudentId) renderStudentTasks(currentSelectedStudentId);
    }
};

window.editStudent = async (id) => {
    const s = await db.students.get(id);
    document.getElementById('studentId').value = s.id;
    document.getElementById('stdName').value = s.firstName;
    document.getElementById('stdSurname').value = s.lastName;
    document.getElementById('stdClass').value = s.classLevel;
    document.getElementById('stdSection').value = s.section;
    document.getElementById('stdNo').value = s.number;
    document.getElementById('studentModal').classList.remove('hidden');
};

window.editTask = async (id) => {
    const t = await db.tasks.get(id);
    document.getElementById('taskId').value = t.id;
    document.getElementById('taskStudentId').value = t.studentId;
    document.getElementById('taskSubject').value = t.subject;
    document.getElementById('taskTopic').value = t.topic;
    document.getElementById('taskDeadline').value = t.deadline;
    document.getElementById('taskTags').value = t.tags ? t.tags.join(', ') : '';
    
    await buildCriteriaInputs(); 
    
    if(t.criteriaDetails) {
        t.criteriaDetails.forEach(cd => {
            const input = document.querySelector(`.criteria-input[data-name="${cd.name}"]`);
            if(input) input.value = cd.score;
        });
    }
    document.querySelector(`input[name="isSubmitted"][value="${t.isSubmitted}"]`).checked = true;
    calcScore();
    document.getElementById('taskModal').classList.remove('hidden');
};

window.openTaskModal = async (studentId) => {
    document.getElementById('taskId').value = '';
    document.getElementById('taskStudentId').value = studentId;
    document.getElementById('taskTopic').value = '';
    document.getElementById('taskDeadline').value = '';
    document.getElementById('taskTags').value = '';
    await buildCriteriaInputs();
    calcScore();
    document.getElementById('taskModal').classList.remove('hidden');
};

async function buildCriteriaInputs() {
    const grid = document.getElementById('criteriaGrid');
    grid.innerHTML = '';
    const items = await db.criteria.toArray();
    items.forEach((c, i) => {
        grid.innerHTML += `
            <div class="flex justify-between items-start bg-gray-50 dark:bg-gray-700 p-2 rounded">
                <span class="text-sm font-semibold flex-1 pr-3 break-words whitespace-normal leading-tight text-gray-800 dark:text-gray-200">${i+1}. ${c.name}</span>
                <input type="number" min="0" step="1" value="0" data-name="${c.name}" class="criteria-input w-16 flex-shrink-0 border rounded text-center dark:bg-gray-800 outline-none p-1 focus:ring-2 focus:ring-blue-500" oninput="calcScore()">
            </div>`;
    });
}

window.calcScore = () => {
    let t = 0;
    document.querySelectorAll('.criteria-input').forEach(i => t += Number(i.value) || 0);
    document.getElementById('taskTotalScore').innerText = t;
};

async function renderCriteriaList() {
    const list = document.getElementById('criteriaList');
    list.innerHTML = '';
    const items = await db.criteria.toArray();
    items.forEach(c => {
        const li = document.createElement('li');
        li.className = "flex justify-between items-center bg-gray-50 dark:bg-gray-700 p-2 rounded";
        li.innerHTML = `<span class="break-words flex-1 pr-2 text-sm">${c.name}</span><button onclick="deleteCriteria(${c.id})" class="text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>`;
        list.appendChild(li);
    });
}
window.deleteCriteria = async (id) => {
    await db.criteria.delete(id);
    renderCriteriaList();
};

// ==========================================
// RAPORLAMA VE ÇIKTI ALMA
// ==========================================

function getSignatureHTML() {
    const teacher = `${localStorage.getItem('teacherName') || ''} ${localStorage.getItem('teacherSurname') || ''}`;
    const branch = localStorage.getItem('teacherBranch') || 'Fen Bilimleri Öğretmeni';
    const principal = localStorage.getItem('principalName') || 'Okul Müdürü';
    
    return `
        <div style="margin-top: 50px; display: flex; justify-content: space-between; font-size: 14px; text-align: center; page-break-inside: avoid;">
            <div style="width: 45%;">
                <p style="margin:0;"><strong>${teacher}</strong></p>
                <p style="margin:0;">${branch}</p>
            </div>
            <div style="width: 45%;">
                <p style="margin:0;"><strong>${principal}</strong></p>
                <p style="margin:0;">Okul Müdürü</p>
            </div>
        </div>
    `;
}

// BİREYSEL RAPOR (Önizleme)
window.openReportPreview = async (sid) => {
    const s = await db.students.get(sid);
    const ts = await db.tasks.where({studentId: sid}).toArray();
    const school = localStorage.getItem('schoolName') || 'Okul Adı Girilmedi';
    const startY = localStorage.getItem('startYear') || '2025';
    const endY = localStorage.getItem('endYear') || '2026';
    const academicYearStr = `${startY} - ${endY} Eğitim - Öğretim Yılı`;

    let html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: black; line-height: 1.5;">
            <h2 style="text-align: center; margin-bottom: 5px; font-size: 20px; text-transform: uppercase;">${school}</h2>
            <h4 style="text-align: center; margin-top: 0; margin-bottom: 20px; font-weight: normal;">${academicYearStr}</h4>
            
            <div style="margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px;">
                <p style="margin: 5px 0;"><strong>Öğrenci Adı Soyadı:</strong> ${s.firstName} ${s.lastName}</p>
                <p style="margin: 5px 0;"><strong>Öğrenci No / Sınıf:</strong> ${s.number} - ${s.classLevel} / ${s.section}</p>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px;">
                <thead>
                    <tr style="background-color: #f3f4f6; text-align: left;">
                        <th style="border: 1px solid #d1d5db; padding: 10px 8px;">Ders</th>
                        <th style="border: 1px solid #d1d5db; padding: 10px 8px;">Tür</th>
                        <th style="border: 1px solid #d1d5db; padding: 10px 8px;">Konu</th>
                        <th style="border: 1px solid #d1d5db; padding: 10px 8px;">Teslim Tarihi</th>
                        <th style="border: 1px solid #d1d5db; padding: 10px 8px;">Durum</th>
                        <th style="border: 1px solid #d1d5db; padding: 10px 8px;">Puan</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    if(ts.length === 0){
        html += `<tr><td colspan="6" style="border: 1px solid #d1d5db; padding: 10px 8px; text-align: center;">Kayıtlı görev bulunmamaktadır.</td></tr>`;
    } else {
        ts.forEach(t => {
            let durum = t.isSubmitted ? '<span style="color: green; font-weight: bold;">Teslim Etti</span>' : '<span style="color: red; font-weight: bold;">Etmedi</span>';
            html += `
                <tr>
                    <td style="border: 1px solid #d1d5db; padding: 8px;">${t.subject}</td>
                    <td style="border: 1px solid #d1d5db; padding: 8px;">${t.tags.join(', ')}</td>
                    <td style="border: 1px solid #d1d5db; padding: 8px;">${t.topic}</td>
                    <td style="border: 1px solid #d1d5db; padding: 8px;">${t.deadline}</td>
                    <td style="border: 1px solid #d1d5db; padding: 8px;">${durum}</td>
                    <td style="border: 1px solid #d1d5db; padding: 8px; font-weight: bold;">${t.totalScore}</td>
                </tr>
            `;
        });
    }
    
    html += `</tbody></table>${getSignatureHTML()}</div>`;
    document.getElementById('reportPreviewContent').innerHTML = html;
    document.getElementById('reportPreviewModal').classList.remove('hidden');
};

// SINIF LİSTESİ TOPLU RAPOR (Ölçekler ve Kriterlerle)
window.openBulkReportPreview = async () => {
    const students = await db.students.toArray();
    const tasks = await db.tasks.toArray();
    const criteriaList = await db.criteria.toArray();
    
    const school = localStorage.getItem('schoolName') || 'Okul Adı Girilmedi';
    const startY = localStorage.getItem('startYear') || '2025';
    const endY = localStorage.getItem('endYear') || '2026';
    const academicYearStr = `${startY} - ${endY} Eğitim Öğretim Yılı`;

    // Rapor Başlık Seçici
    let reportTagTitle = "Görev Değerlendirme Ölçekleri";
    if (globalBulkReportFilter) {
        const capTag = globalBulkReportFilter.charAt(0).toUpperCase() + globalBulkReportFilter.slice(1);
        reportTagTitle = `${capTag} Değerlendirme Ölçekleri`;
    }

    const classes = {};
    students.forEach(s => {
        const key = `${s.classLevel}/${s.section}`;
        if(!classes[key]) classes[key] = [];
        classes[key].push(s);
    });
    const sortedKeys = Object.keys(classes).sort();

    // Sınıf Filtresi Uygulama
    let filteredKeys = sortedKeys;
    if (globalBulkClassFilter !== 'all') {
        filteredKeys = sortedKeys.filter(k => k === globalBulkClassFilter);
    }

    let html = `<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: black; line-height: 1.5; overflow-x: auto;">`;

    if(filteredKeys.length === 0) {
        html += `<p style="text-align:center; padding: 20px;">Seçilen kritere uygun sınıf/öğrenci bulunmuyor.</p>`;
    } else {
        // Lejant HTML Hazırlığı
        let legendHTML = `<div style="font-size:12px; color:#444; margin-bottom:15px; text-align:center;">`;
        legendHTML += criteriaList.map((c, i) => `<strong>K${i+1}:</strong> ${c.name}`).join(' | ');
        legendHTML += `</div>`;

        filteredKeys.forEach(key => {
            html += `<div style="page-break-after: always; padding-bottom: 40px;">`;
            html += `<h2 style="text-align: center; margin-bottom: 20px; font-size: 18px; text-transform: uppercase;">${academicYearStr} ${school} ${key} ${reportTagTitle}</h2>`;
            html += legendHTML;
            
            html += `
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; text-align: center;">
                    <thead>
                        <tr style="background-color: #f3f4f6;">
                            <th style="border: 1px solid #d1d5db; padding: 6px;">No</th>
                            <th style="border: 1px solid #d1d5db; padding: 6px; text-align:left;">Ad Soyad</th>
                            <th style="border: 1px solid #d1d5db; padding: 6px; text-align:left;">Ders</th>
                            <th style="border: 1px solid #d1d5db; padding: 6px; text-align:left;">Konu</th>`;
            
            criteriaList.forEach((_, i) => {
                html += `<th style="border: 1px solid #d1d5db; padding: 6px; width:25px;">K${i+1}</th>`;
            });
                            
            html += `       <th style="border: 1px solid #d1d5db; padding: 6px;">Toplam</th>
                        </tr>
                    </thead>
                    <tbody>
            `;
            
            classes[key].sort((a,b) => a.number - b.number).forEach(s => {
                let studentTasks = tasks.filter(t => t.studentId === s.id);
                
                if (globalBulkReportFilter) {
                    studentTasks = studentTasks.filter(t => 
                        t.tags.some(tag => tag.toLowerCase().includes(globalBulkReportFilter))
                    );
                }

                if(studentTasks.length === 0) {
                    html += `<tr>
                        <td style="border: 1px solid #d1d5db; padding: 6px;">${s.number}</td>
                        <td style="border: 1px solid #d1d5db; padding: 6px; text-align:left;">${s.firstName} ${s.lastName}</td>
                        <td style="border: 1px solid #d1d5db; padding: 6px; text-align:center; color:#888;" colspan="${criteriaList.length + 3}">Görev kaydı yok</td>
                    </tr>`;
                } else {
                    studentTasks.forEach(t => {
                        html += `<tr>
                            <td style="border: 1px solid #d1d5db; padding: 6px;">${s.number}</td>
                            <td style="border: 1px solid #d1d5db; padding: 6px; text-align:left;">${s.firstName} ${s.lastName}</td>
                            <td style="border: 1px solid #d1d5db; padding: 6px; text-align:left;">${t.subject}</td>
                            <td style="border: 1px solid #d1d5db; padding: 6px; text-align:left;">${t.topic}</td>`;
                        
                        criteriaList.forEach(c => {
                            const detail = t.criteriaDetails ? t.criteriaDetails.find(cd => cd.name === c.name) : null;
                            const score = detail ? detail.score : '-';
                            html += `<td style="border: 1px solid #d1d5db; padding: 6px;">${score}</td>`;
                        });
                        
                        html += `   <td style="border: 1px solid #d1d5db; padding: 6px; font-weight:bold;">${t.totalScore}</td>
                        </tr>`;
                    });
                }
            });
            html += `</tbody></table>`;
            html += getSignatureHTML();
            html += `</div>`; 
        });
    }

    html += `</div>`;
    document.getElementById('reportPreviewContent').innerHTML = html;
    document.getElementById('reportPreviewModal').classList.remove('hidden');
};

// WORD (DOC) ÇIKTISI
window.generateWord = async () => {
    const header = "<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>Rapor</title></head><body>";
    const footer = "</body></html>";
    const sourceHTML = header + document.getElementById('reportPreviewContent').innerHTML + footer;
    
    const blob = new Blob(['\ufeff', sourceHTML], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = currentReportType === 'bulk' ? `Sinif_Degerlendirme_Olcekleri.doc` : `Ogrenci_Raporu.doc`;
    
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
};

// PDF ÇIKTISI BİREYSEL (Portre)
window.generatePDF = async (sid) => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const s = await db.students.get(sid);
    const ts = await db.tasks.where({studentId: sid}).toArray();
    
    const school = localStorage.getItem('schoolName') || 'Okul Adi Girilmedi';
    const startY = localStorage.getItem('startYear') || '2025';
    const endY = localStorage.getItem('endYear') || '2026';
    const academicYearStr = `${startY} - ${endY} Egitim Ogretim Yili`;
    
    const teacher = `${localStorage.getItem('teacherName') || ''} ${localStorage.getItem('teacherSurname') || ''}`;
    const branch = localStorage.getItem('teacherBranch') || 'Ogretmen';
    const principal = localStorage.getItem('principalName') || 'Okul Muduru';
    
    doc.setFont("helvetica", "bold"); 
    doc.text(school, 105, 15, {align: 'center'});
    doc.setFontSize(10); 
    doc.setFont("helvetica", "normal");
    doc.text(academicYearStr, 105, 22, {align: 'center'});
    doc.text(`Ogrenci: ${s.number} - ${s.firstName} ${s.lastName} (${s.classLevel}/${s.section})`, 14, 32);
    
    const body = ts.map(t => [t.subject, t.tags.join(', '), t.topic, t.deadline, t.isSubmitted ? 'Teslim Etti' : 'Etmedi', t.totalScore]);
    
    doc.autoTable({ 
        startY: 38, 
        head: [['Ders','Tur', 'Konu','Teslim Tarihi','Durum','Puan']], 
        body: body,
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] }
    });

    let finalY = doc.lastAutoTable.finalY + 20;
    if(finalY > 260) { doc.addPage(); finalY = 30; }
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(teacher, 50, finalY, {align: 'center'});
    doc.text(principal, 160, finalY, {align: 'center'});
    doc.setFont("helvetica", "normal");
    doc.text(branch, 50, finalY + 6, {align: 'center'});
    doc.text("Okul Muduru", 160, finalY + 6, {align: 'center'});

    doc.save(`${s.firstName}_${s.lastName}_Rapor.pdf`);
};

// PDF ÇIKTISI TOPLU LİSTE (Yatay Ölçekli Format)
window.generateBulkPDF = async () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape'); 
    const pageWidth = doc.internal.pageSize.getWidth();
    const centerX = pageWidth / 2;

    const school = localStorage.getItem('schoolName') || 'Okul Adi Girilmedi';
    const startY = localStorage.getItem('startYear') || '2025';
    const endY = localStorage.getItem('endYear') || '2026';
    const academicYearStr = `${startY} - ${endY} Egitim Ogretim Yili`;
    
    const teacher = `${localStorage.getItem('teacherName') || ''} ${localStorage.getItem('teacherSurname') || ''}`;
    const branch = localStorage.getItem('teacherBranch') || 'Ogretmen';
    const principal = localStorage.getItem('principalName') || 'Okul Muduru';

    let reportTagTitle = "Gorev Degerlendirme Olcekleri";
    if (globalBulkReportFilter) {
        const capTag = globalBulkReportFilter.charAt(0).toUpperCase() + globalBulkReportFilter.slice(1);
        reportTagTitle = `${capTag} Degerlendirme Olcekleri`;
    }

    const students = await db.students.toArray();
    const tasks = await db.tasks.toArray();
    const criteriaList = await db.criteria.toArray();
    
    const classes = {};
    students.forEach(s => {
        const key = `${s.classLevel}/${s.section}`;
        if(!classes[key]) classes[key] = [];
        classes[key].push(s);
    });
    
    const sortedKeys = Object.keys(classes).sort();
    let filteredKeys = sortedKeys;
    if (globalBulkClassFilter !== 'all') {
        filteredKeys = sortedKeys.filter(k => k === globalBulkClassFilter);
    }

    for (let i = 0; i < filteredKeys.length; i++) {
        let key = filteredKeys[i];
        if (i > 0) doc.addPage(); 

        doc.setFont("helvetica", "bold"); 
        doc.setFontSize(14); 
        doc.text(`${academicYearStr} ${school.toUpperCase()}`, centerX, 15, {align: 'center'});
        doc.text(`${key} Sinifi ${reportTagTitle}`, centerX, 22, {align: 'center'});
        
        const legendStr = criteriaList.map((c, idx) => `K${idx+1}: ${c.name}`).join(' | ');
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        const splitLegend = doc.splitTextToSize(legendStr, pageWidth - 28);
        doc.text(splitLegend, 14, 30);
        
        let currentY = 32 + (splitLegend.length * 4);

        const headBase = ['No', 'Ad Soyad', 'Ders', 'Konu'];
        const criteriaHeaders = criteriaList.map((_, idx) => `K${idx+1}`);
        const head = [...headBase, ...criteriaHeaders, 'Toplam'];

        const body = [];
        classes[key].sort((a,b) => a.number - b.number).forEach(s => {
            let studentTasks = tasks.filter(t => t.studentId === s.id);
            
            if (globalBulkReportFilter) {
                studentTasks = studentTasks.filter(t => 
                    t.tags.some(tag => tag.toLowerCase().includes(globalBulkReportFilter))
                );
            }

            if(studentTasks.length === 0) {
                const emptyScores = criteriaList.map(() => '-');
                body.push([s.number, `${s.firstName} ${s.lastName}`, '-', '-', ...emptyScores, '-']);
            } else {
                studentTasks.forEach(t => {
                    const scores = criteriaList.map(c => {
                        const detail = t.criteriaDetails ? t.criteriaDetails.find(cd => cd.name === c.name) : null;
                        return detail ? detail.score : '-';
                    });
                    body.push([s.number, `${s.firstName} ${s.lastName}`, t.subject, t.topic, ...scores, t.totalScore]);
                });
            }
        });

        doc.autoTable({
            startY: currentY,
            head: [head],
            body: body,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [20, 184, 166], halign: 'center' },
            columnStyles: {
                0: { halign: 'center', cellWidth: 10 },
                1: { cellWidth: 35 },
                2: { cellWidth: 25 },
                3: { cellWidth: 40 }
            }
        });

        let finalY = doc.lastAutoTable.finalY + 15;
        if (finalY > 180) { doc.addPage(); finalY = 30; }
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(teacher, 50, finalY, {align: 'center'});
        doc.text(principal, pageWidth - 50, finalY, {align: 'center'});
        doc.setFont("helvetica", "normal");
        doc.text(branch, 50, finalY + 6, {align: 'center'});
        doc.text("Okul Muduru", pageWidth - 50, finalY + 6, {align: 'center'});
    }

    doc.save(`Sinif_Degerlendirme_Olcekleri.pdf`);
};

function populateYearSelects() {
    const startSel = document.getElementById('startYear');
    const endSel = document.getElementById('endYear');
    startSel.innerHTML = ''; endSel.innerHTML = '';
    for(let i = 2023; i <= 2040; i++) {
        startSel.innerHTML += `<option value="${i}">${i}</option>`;
        endSel.innerHTML += `<option value="${i}">${i}</option>`;
    }
}

function updateClock() {
    const n = new Date();
    document.getElementById('currentDate').innerText = n.toLocaleDateString('tr-TR');
    document.getElementById('currentTime').innerText = n.toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'});
}

function loadSettings() {
    populateYearSelects();
    const currYear = new Date().getFullYear();
    document.getElementById('startYear').value = localStorage.getItem('startYear') || currYear.toString();
    document.getElementById('endYear').value = localStorage.getItem('endYear') || (currYear + 1).toString();
    
    document.getElementById('schoolName').value = localStorage.getItem('schoolName') || '';
    document.getElementById('principalName').value = localStorage.getItem('principalName') || '';
    document.getElementById('teacherName').value = localStorage.getItem('teacherName') || '';
    document.getElementById('teacherSurname').value = localStorage.getItem('teacherSurname') || '';
    document.getElementById('teacherBranch').value = localStorage.getItem('teacherBranch') || 'Fen Bilimleri Öğretmeni';
}

async function checkNotifications() {
    if (Notification.permission === 'granted') {
        const today = new Date().toISOString().split('T')[0];
        const ts = await db.tasks.where({isSubmitted: false}).toArray();
        ts.forEach(async t => {
            if(t.deadline === today) {
                const s = await db.students.get(t.studentId);
                new Notification("Teslim Hatırlatıcı", {body: `${s.firstName} ${s.lastName} - ${t.topic} ${t.tags.join('/')} bugün teslim edilmeli!`});
            }
        });
    } else if (Notification.permission !== 'denied') { 
        Notification.requestPermission(); 
    }
}

async function startApp() {
    try {
        await initDB();
        loadSettings();
        setupEventListeners();
        await renderStudents();
        updateClock();
        setInterval(updateClock, 1000);
        setTimeout(checkNotifications, 5000);
    } catch (err) {
        console.error("Uygulama başlatılırken bir hata oluştu:", err);
    }
}

startApp();