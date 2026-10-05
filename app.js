/* ==========================================================================
   CONFIGURAÇÕES GLOBAIS E VARIÁVEIS DE ESTADO
   ========================================================================== */
const API_URL = "/api";
let registrosGlobais = [];
let mapaInstancia = null;
let chartInstancia = null;
let latAtual = null;
let lngAtual = null;

let dataVisualizada = new Date();

// Lista oficial de feriados nacionais/regionais
const FERIADOS_OFICIAIS = [
    "2026-01-01", "2026-01-25", "2026-02-16", "2026-02-17",
    "2026-04-03", "2026-04-21", "2026-05-01", "2026-06-04",
    "2026-07-09", "2026-09-07", "2026-10-12", "2026-11-02",
    "2026-11-15", "2026-11-20", "2026-12-25",
    "2027-01-01", "2027-02-08", "2027-02-09", "2027-03-26",
    "2027-04-21", "2027-05-01", "2027-05-27", "2027-07-09",
    "2027-09-07", "2027-10-12", "2027-11-02", "2027-11-15",
    "2027-11-20", "2027-12-25"
];

// Tabela de regras de dias presenciais exigidos de acordo com dias úteis do mês
const REGRAS_PLANILHA_VIVO = {
    1: 1, 2: 1, 3: 1, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 10: 6,
    11: 6, 12: 7, 13: 7, 14: 8, 15: 9, 16: 9, 17: 10, 18: 10,
    19: 11, 20: 12, 21: 12, 22: 13, 23: 13, 24: 14
};

const NOMES_MESES = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

/* ==========================================================================
   FUNÇÕES AUXILIARES DE FORMATAÇÃO
   ========================================================================== */
function normalizarTexto(texto) {
    if (!texto) return '';
    return texto.toString().trim().toLowerCase();
}

function normalizarDataISO(dataStr) {
    if (!dataStr) return "";
    if (dataStr.includes("T")) dataStr = dataStr.split("T")[0];
    if (dataStr.includes("/")) {
        const p = dataStr.split("/");
        if (p.length === 3) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
    }
    return dataStr;
}

function navegarMes(direcao) {
    dataVisualizada.setMonth(dataVisualizada.getMonth() + direcao);
    renderizarDashboard();
    renderizarCalendario();
}

function calcularDiasUteisMes(ano, mes) {
    const totalDiasNoMes = new Date(ano, mes + 1, 0).getDate();
    let diasUteis = 0;
    let feriadosEmDiasUteis = 0;

    for (let dia = 1; dia <= totalDiasNoMes; dia++) {
        const dataObj = new Date(ano, mes, dia);
        const diaSemana = dataObj.getDay();
        
        const diaPad = dia < 10 ? '0' + dia : dia;
        const mesPad = (mes + 1) < 10 ? '0' + (mes + 1) : (mes + 1);
        const dataStr = `${ano}-${mesPad}-${diaPad}`;

        const ehFds = (diaSemana === 0 || diaSemana === 6);
        const ehFeriado = FERIADOS_OFICIAIS.includes(dataStr);

        if (!ehFds) {
            if (ehFeriado) {
                feriadosEmDiasUteis++;
            } else {
                diasUteis++;
            }
        }
    }
    return { diasUteis, feriadosEmDiasUteis };
}

/* ==========================================================================
   CARREGAMENTO DE DADOS DA API
   ========================================================================== */
async function carregarDados() {
    try {
        const res = await fetch(`${API_URL}/registros`);
        if (res.ok) {
            registrosGlobais = await res.json();
            renderizarDashboard();
            renderizarCalendario();
            renderizarHistorico();
            verificarLembretePontoHoje();
        }
    } catch (err) {
        console.error("Erro ao carregar dados:", err);
        const elemHist = document.getElementById("listaHistorico");
        if (elemHist) elemHist.innerHTML = "<p style='color:#c62828; text-align:center;'>Erro ao carregar registros da API.</p>";
    }
}

/* ==========================================================================
   RENDERIZAÇÃO DO DASHBOARD
   ========================================================================== */
function renderizarDashboard() {
    const ano = dataVisualizada.getFullYear();
    const mes = dataVisualizada.getMonth();
    const mesPad = (mes + 1) < 10 ? '0' + (mes + 1) : (mes + 1);
    const prefixoMesAno = `${ano}-${mesPad}`;

    document.querySelectorAll('.displayMesAno').forEach(el => {
        el.innerText = `${NOMES_MESES[mes]} ${ano}`;
    });

    const registrosDoMes = (registrosGlobais || []).filter(r => {
        const dtNorm = normalizarDataISO(r.data);
        return dtNorm && dtNorm.startsWith(prefixoMesAno);
    });

    const presenciais = registrosDoMes.filter(r => normalizarTexto(r.tipo).includes('presencial')).length;
    const homeOffice = registrosDoMes.filter(r => normalizarTexto(r.tipo).includes('home') || normalizarTexto(r.tipo).includes('office')).length;
    const folgas = registrosDoMes.filter(r => normalizarTexto(r.tipo).includes('folga') || normalizarTexto(r.tipo).includes('feriado')).length;
    const fdsRegistrados = registrosDoMes.filter(r => normalizarTexto(r.tipo).includes('final') || normalizarTexto(r.tipo).includes('fds')).length;

    const { diasUteis, feriadosEmDiasUteis } = calcularDiasUteisMes(ano, mes);
    const metaPresencialExigida = REGRAS_PLANILHA_VIVO[diasUteis] || 12;
    const pctMetaExigida = diasUteis > 0 ? ((metaPresencialExigida / diasUteis) * 100).toFixed(2) : 0;
    const pctProgressoAtual = metaPresencialExigida > 0 ? Math.min(((presenciais / metaPresencialExigida) * 100), 100).toFixed(1) : 0;

    const elemTotalPresencial = document.getElementById('totalPresencial');
    if (elemTotalPresencial) elemTotalPresencial.innerText = `${presenciais} de ${metaPresencialExigida} Dias Presenciais Feitos`;

    const elemProgresso = document.getElementById('pctProgressoAtual');
    if (elemProgresso) elemProgresso.innerText = `🎯 Progresso Atual: ${pctProgressoAtual}% da meta concluída`;

    const elemDetalhesMeta = document.getElementById('pctPresencial');
    if (elemDetalhesMeta) {
        elemDetalhesMeta.innerText = `Mês tem ${diasUteis} dias úteis (descontados ${feriadosEmDiasUteis} feriado(s)) | Meta: ${metaPresencialExigida} dias (${pctMetaExigida}%)`;
    }

    const progressBarFill = document.getElementById('progressBarFill');
    if (progressBarFill) progressBarFill.style.width = `${pctProgressoAtual}%`;

    const elemDetMetrica = document.getElementById('detalhesMétricas');
    if (elemDetMetrica) {
        elemDetMetrica.innerHTML = `
            🏢 <b>Presenciais:</b> ${presenciais} dia(s)<br>
            🏠 <b>Home Office:</b> ${homeOffice} dia(s)<br>
            🏖️️ <b>Folgas/Feriados:</b> ${folgas} dia(s)<br>
            📅 <b>Fins de Semana:</b> ${fdsRegistrados} dia(s)
        `;
    }

    const canvasChart = document.getElementById('graficoJornada');
    if (canvasChart) {
        const ctx = canvasChart.getContext('2d');
        if (chartInstancia) chartInstancia.destroy();

        const isDark = document.body.classList.contains('dark-mode');
        const textColor = isDark ? '#ffffff' : '#212529';

        chartInstancia = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Home Office', 'Folga (Feriado)', 'Final de Semana', 'Presencial'],
                datasets: [{
                    data: [homeOffice, folgas, fdsRegistrados, presenciais],
                    backgroundColor: ['#0288d1', '#ed6c02', '#9c27b0', '#2e7d32'],
                    borderWidth: 2,
                    borderColor: isDark ? '#1e1e1e' : '#ffffff',
                    hoverOffset: 15
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right', labels: { color: textColor, font: { size: 12, weight: 'bold' } } }
                }
            }
        });
    }
}

/* ==========================================================================
   RENDERIZAÇÃO DO CALENDÁRIO
   ========================================================================== */
function renderizarCalendario() {
    const grid = document.getElementById('gridCalendario');
    if (!grid) return;
    grid.innerHTML = '';

    const ano = dataVisualizada.getFullYear();
    const mes = dataVisualizada.getMonth();

    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    diasSemana.forEach(d => {
        const head = document.createElement('div');
        head.className = 'cal-head';
        head.innerText = d;
        grid.appendChild(head);
    });

    const primeiroDiaIndex = new Date(ano, mes, 1).getDay();
    const totalDiasMes = new Date(ano, mes + 1, 0).getDate();

    for (let i = 0; i < primeiroDiaIndex; i++) {
        const empty = document.createElement('div');
        empty.className = 'cal-empty';
        grid.appendChild(empty);
    }

    for (let dia = 1; dia <= totalDiasMes; dia++) {
        const diaPad = dia < 10 ? '0' + dia : dia;
        const mesPad = (mes + 1) < 10 ? '0' + (mes + 1) : (mes + 1);
        const dataISO = `${ano}-${mesPad}-${diaPad}`;

        const elDia = document.createElement('div');
        elDia.className = 'cal-day';
        elDia.innerText = dia;

        const reg = registrosGlobais.find(r => normalizarDataISO(r.data) === dataISO);
        if (reg) {
            const tipoNorm = normalizarTexto(reg.tipo);
            if (tipoNorm.includes('presencial')) elDia.classList.add('Presencial');
            else if (tipoNorm.includes('home') || tipoNorm.includes('office')) elDia.classList.add('HomeOffice');
            else if (tipoNorm.includes('folga') || tipoNorm.includes('feriado')) elDia.classList.add('Folga');
            else if (tipoNorm.includes('final') || tipoNorm.includes('fds')) elDia.classList.add('FinalDeSemana');
        }

        elDia.onclick = () => {
            document.getElementById('dataManual').value = dataISO;
            mudarAba('tabNovo', document.querySelectorAll('.nav-item')[1]);
        };

        grid.appendChild(elDia);
    }
}

/* ==========================================================================
   RENDERIZAÇÃO DO HISTÓRICO EXPANSÍVEL
   ========================================================================== */
function renderizarHistorico() {
    const lista = document.getElementById('listaHistorico');
    if (!lista) return;

    if (registrosGlobais.length === 0) {
        lista.innerHTML = "<p style='text-align:center; color:var(--text-muted); font-size:13px;'>Nenhum ponto registrado ainda.</p>";
        return;
    }

    lista.innerHTML = '';
    const ordenados = [...registrosGlobais].sort((a, b) => new Date(b.data) - new Date(a.data));

    ordenados.forEach((r, idx) => {
        const dtNorm = normalizarDataISO(r.data);
        const partes = dtNorm.split('-');
        const dataBR = partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : r.data;

        const tipoNorm = normalizarTexto(r.tipo);
        let classeBadge = "badge-Presencial";
        if (tipoNorm.includes('home') || tipoNorm.includes('office')) classeBadge = "badge-HomeOffice";
        else if (tipoNorm.includes('folga') || tipoNorm.includes('feriado')) classeBadge = "badge-Folga";
        else if (tipoNorm.includes('final') || tipoNorm.includes('fds')) classeBadge = "badge-FinalDeSemana";

        const card = document.createElement('div');
        card.className = 'hist-item-card';

        const mapId = `map-hist-${idx}`;

        card.innerHTML = `
            <div class="hist-header-content" onclick="toggleDetalhesHistorico('${mapId}', ${r.latitude}, ${r.longitude})">
                <div>
                    <span class="badge-tipo ${classeBadge}">${r.tipo || 'Presencial'}</span>
                    <div style="font-weight: bold; font-size: 14px;">${dataBR}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${r.empresa || 'Empresa'}</div>
                </div>
                <i class="bi bi-chevron-down" style="color: var(--text-muted);"></i>
            </div>
            <div id="details-${mapId}" class="hist-details">
                <p style="font-size: 12px; margin-bottom: 6px;"><b>Observação:</b> ${r.observacao || 'Sem observações'}</p>
                ${r.foto_url ? `<div style="margin-top: 8px;"><img src="${r.foto_url}" class="thumb-img" onclick="ampliarFoto('${r.foto_url}')" alt="Comprovante"></div>` : ''}
                ${(r.latitude && r.longitude) ? `<div id="${mapId}" class="map-hist"></div>` : '<p style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">Sem localização GPS</p>'}
                <div class="card-actions">
                    <button class="btn-action-delete" onclick="apagarRegistro('${r.id}')">🗑 Apagar Registro</button>
                </div>
            </div>
        `;

        lista.appendChild(card);
    });
}

function toggleDetalhesHistorico(mapId, lat, lng) {
    const detailsDiv = document.getElementById(`details-${mapId}`);
    if (!detailsDiv) return;

    const isActive = detailsDiv.classList.contains('active');
    
    // Fecha todos os outros detalhes abertos
    document.querySelectorAll('.hist-details').forEach(el => el.classList.remove('active'));

    if (!isActive) {
        detailsDiv.classList.add('active');
        if (lat && lng) {
            setTimeout(() => {
                const mapContainer = document.getElementById(mapId);
                if (mapContainer && !mapContainer._leaflet_id) {
                    const map = L.map(mapId).setView([lat, lng], 15);
                    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                        attribution: '© OpenStreetMap'
                    }).addTo(map);
                    L.marker([lat, lng]).addTo(map);
                }
            }, 100);
        }
    }
}

/* ==========================================================================
   GEOLOCALIZAÇÃO E MAPA DE REGISTRO
   ========================================================================== */
function inicializarMapaRegistro() {
    const containerMapa = document.getElementById('mapaLocal');
    if (!containerMapa) return;

    if (!mapaInstancia) {
        mapaInstancia = L.map('mapaLocal').setView([-23.55052, -46.633308], 12); // Padrão SP
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(mapaInstancia);
    }

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                latAtual = pos.coords.latitude;
                lngAtual = pos.coords.longitude;
                mapaInstancia.setView([latAtual, lngAtual], 16);
                L.marker([latAtual, lngAtual]).addTo(mapaInstancia).bindPopup("Sua Localização Atual").openPopup();
            },
            (err) => console.warn("Erro ao obter GPS:", err),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }
}

/* ==========================================================================
   ENVIO DO FORMULÁRIO E APAGAR REGISTRO
   ========================================================================== */
document.getElementById('formPonto')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    const btnSalvar = document.getElementById('btnSalvar');
    const statusMsg = document.getElementById('statusMsg');
    
    btnSalvar.disabled = true;
    statusMsg.innerText = "Enviando registro...";
    statusMsg.className = "status-msg";

    const formData = new FormData(this);
    if (latAtual) formData.append('latitude', latAtual);
    if (lngAtual) formData.append('longitude', lngAtual);

    try {
        const res = await fetch(`${API_URL}/registrar`, {
            method: 'POST',
            body: formData
        });

        if (res.ok) {
            statusMsg.innerText = "✅ Ponto registrado com sucesso!";
            statusMsg.className = "status-msg status-sucesso";
            this.reset();
            await carregarDados();
            setTimeout(() => {
                statusMsg.innerText = "";
                mudarAba('tabDashboard', document.querySelectorAll('.nav-item')[0]);
            }, 1500);
        } else {
            throw new Error("Erro na resposta do servidor");
        }
    } catch (err) {
        console.error(err);
        statusMsg.innerText = "❌ Erro ao salvar ponto. Tente novamente.";
        statusMsg.className = "status-msg status-erro";
    } finally {
        btnSalvar.disabled = false;
    }
});

async function apagarRegistro(id) {
    if (!confirm("Tem certeza que deseja apagar este registro?")) return;

    try {
        const res = await fetch(`${API_URL}/registros/${id}`, { method: 'DELETE' });
        if (res.ok) {
            await carregarDados();
        } else {
            alert("Não foi possível apagar o registro.");
        }
    } catch (err) {
        console.error("Erro ao apagar:", err);
        alert("Erro de conexão ao apagar o registro.");
    }
}

/* ==========================================================================
   EXPORTAÇÃO DE DADOS (CSV)
   ========================================================================== */
function exportarCSV() {
    if (registrosGlobais.length === 0) {
        alert("Não há registros para exportar.");
        return;
    }

    let csvContent = "data:text/csv;charset=utf-8,Data,Tipo,Empresa,Observacao,Latitude,Longitude\n";

    registrosGlobais.forEach(r => {
        const dt = normalizarDataISO(r.data);
        const tipo = `"${r.tipo || ''}"`;
        const emp = `"${r.empresa || ''}"`;
        const obs = `"${r.observacao || ''}"`;
        const lat = r.latitude || '';
        const lng = r.longitude || '';
        csvContent += `${dt},${tipo},${emp},${obs},${lat},${lng}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `controle_hibrido_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/* ==========================================================================
   MODAIS, TEMAS E NAVEGAÇÃO DE ABAS
   ========================================================================== */
function mudarAba(idAba, elBtn) {
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));

    const abaAlvo = document.getElementById(idAba);
    if (abaAlvo) abaAlvo.classList.add('active');
    if (elBtn) elBtn.classList.add('active');

    if (idAba === 'tabNovo') {
        setTimeout(inicializarMapaRegistro, 200);
    }
}

function alternarTema() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    
    document.getElementById('lblTheme').innerText = isDark ? "Claro" : "Escuro";
    const icone = document.querySelector('#btnTheme i');
    if (icone) {
        icone.className = isDark ? "bi bi-sun-fill" : "bi bi-moon-fill";
    }

    renderizarDashboard();
}

function verificarLembretePontoHoje() {
    const hojeISO = new Date().toISOString().split('T')[0];
    const registrouHoje = registrosGlobais.some(r => normalizarDataISO(r.data) === hojeISO);

    if (!registrouHoje) {
        const modal = document.getElementById('reminderModal');
        if (modal) modal.style.display = 'flex';
    }
}

function fecharLembrete() {
    const modal = document.getElementById('reminderModal');
    if (modal) modal.style.display = 'none';
}

function irParaRegistroPonto() {
    fecharLembrete();
    mudarAba('tabNovo', document.querySelectorAll('.nav-item')[1]);
}

function ampliarFoto(url) {
    const modal = document.getElementById('imgModal');
    const img = document.getElementById('imgExpanded');
    if (modal && img) {
        img.src = url;
        modal.style.display = 'flex';
    }
}

function fecharModal() {
    const modal = document.getElementById('imgModal');
    if (modal) modal.style.display = 'none';
}

/* ==========================================================================
   INICIALIZAÇÃO DA APLICAÇÃO
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    carregarDados();
});