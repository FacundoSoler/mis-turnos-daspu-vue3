import { getDestructuredLocalDateTime, parseLocalDateTimeToISO } from "../utils/dateFormatter";

console.log("DASPU Helper: Content Script initialized.");

let emailTemporal: string = "No especificado";
let fichaIdActual: string | null = null;

// ==========================================
// 2. ENRUTADOR DE SPA (Hashchange)
// ==========================================
// Como DASPU es una SPA, escuchamos los cambios de hash para disparar lógicas de lectura
window.addEventListener("hashchange", async () => {
    const url = window.location.href;

    if (url.includes("Turn/TurnData")) {
        executeSelectAllTimeSlotsToggleInjection();
    }
    else if (url.includes("Turn/TurnConfirmation")) {
        await confirmAppointment(url);
    }
    else if (url.includes("Turn/TurnNullify")) {
        await verifyAppointmentNullified();
    }
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => window.dispatchEvent(new Event("hashchange")));
} else {
    window.dispatchEvent(new Event("hashchange"));
}

// ==========================================
// 3. DELEGACIÓN DE EVENTOS GLOBAL (Clics)
// ==========================================
document.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // --- A. Captura de Email Permanente ---
    const inputEmail = document.getElementById('txtEmail') as HTMLInputElement | null;
    if (inputEmail && inputEmail.value.trim() !== "") {
        emailTemporal = inputEmail.value.trim();
    }

    // --- B. 'Siguiente' button (Save Patient's Record) ---
    const btnSiguiente = target.closest('#btnSiguiente');
    if (btnSiguiente && window.location.href.includes("Turn/IndicatePatient")) {
        const fichaId = (document.getElementById('hdnFichaId') as HTMLInputElement)?.value;
        if (fichaId) {
            fichaIdActual = fichaId;
            savePatientRecordInStorage(fichaId);
        }
    }

    // --- C.  'Confirmar' button from final Modal (Save Appointment in 'Pending' status initially) ---
    const ConfirmarButton = target.closest('button[onclick*="confirmarTurno"]');
    if (ConfirmarButton) {
        saveAppointment();
    }

    // --- D. Botón Anular (TurnNullify) ---
    const btnAnular = target.closest('#btnAnular');
    if (btnAnular) {
        const turnoId = (document.getElementById('hdnTurnoId') as HTMLInputElement)?.value;
        if (turnoId) updateAppointmentState(turnoId, "ANULADO");
    }
}, true); // Use capture phase

// ==========================================
// 4. FUNCIONES DE LÓGICA DE NEGOCIO (Próximos Services)
// ==========================================

function savePatientRecordInStorage(fichaId: string) {
    const datosFicha = {
        tipoDocumento: (document.getElementById('ddlTipoDoc') as HTMLSelectElement)?.value || '',
        nroDocumento: (document.getElementById('txtNroDocumento') as HTMLInputElement)?.value.trim() || '',
        telefono: (document.getElementById('txtTelefono') as HTMLInputElement)?.value.trim() || '',
        codArea: (document.getElementById('txtCodArea') as HTMLInputElement)?.value.trim() || '',
        celular: (document.getElementById('txtCelular') as HTMLInputElement)?.value.trim() || '',
        email: (document.getElementById('txtEmail') as HTMLInputElement)?.value.trim() || ''
    };

    const storageKey = `fichaPaciente${fichaId}`;
    chrome.storage.local.set({ [storageKey]: datosFicha }, () => {
        console.log(`Extensión: Ficha guardada localmente (${storageKey})`, datosFicha);
    });
}

function saveAppointment() {
    try {
        const turnoData = {
            fechaCreacionTurnoUTC: new Date().toISOString(),
            fechaTurnoUTC: parseLocalDateTimeToISO(document.getElementById('turnoFechaHora')?.innerText.trim() || ''),
            email: emailTemporal,
            servicio: document.getElementById('turnoServicio')?.innerText.trim() || '',
            prestador: document.getElementById('turnoPrestador')?.innerText.trim() || '',
            ubicacion: document.getElementById('turnoUbicacion')?.innerText.trim() || '',
            observaciones: (document.getElementById('txtObservaciones') as HTMLTextAreaElement)?.value.trim() || '',
            estado: "Pendiente de Confirmación",
        };

        chrome.storage.local.get({ turnos: [] }, (result: any) => {
            const nuevosTurnos = [...result.turnos, turnoData];
            chrome.storage.local.set({ turnos: nuevosTurnos }, () => {
                console.log("Extensión: Turno PENDIENTE guardado.", turnoData);
            });
        });
    } catch (err) {
        console.error("Error extrayendo datos del modal:", err);
    }
}

async function confirmAppointment(url: string) {
    try {
        const hdnTurnoId = await waitForElement('#hdnTurnoId') as HTMLInputElement;
        const textoPagina = document.body.innerText.toLowerCase();

        if (!textoPagina.includes("turno confirmado")) return;

        const turnoId = hdnTurnoId.value || url.match(/Turn\/TurnConfirmation\/(\d+)/)?.[1];
        console.log(`Extensión: ¡Data lista! Procesando Turno ID: ${turnoId}`);

        const textoNormalizadoPagina = textoPagina.replace(/\s+/g, ' ').toUpperCase();

        chrome.storage.local.get({ turnos: [] }, (result: any) => {
            let turnos = [...result.turnos];
            let modificado = false;

            for (let i = turnos.length - 1; i >= 0; i--) {
                if (turnos[i].estado === "Pendiente de Confirmación") {

                    const servicioGuardado = turnos[i].servicio.replace(/\s+/g, ' ').toUpperCase();
                    const prestadorGuardado = turnos[i].prestador.replace(/\s+/g, ' ').toUpperCase();

                    const { date, time } = getDestructuredLocalDateTime(turnos[i].fechaTurnoUTC);
                    const fechaTurnoLocalTimeBD = date;
                    const horaTurnoLocalTimeBD = time;

                    const coincideFecha = fechaTurnoLocalTimeBD && textoNormalizadoPagina.includes(fechaTurnoLocalTimeBD);
                    const coincideHora = horaTurnoLocalTimeBD && textoNormalizadoPagina.includes(horaTurnoLocalTimeBD);

                    const coincideServicio = textoNormalizadoPagina.includes(servicioGuardado);
                    const coincidePrestador = textoNormalizadoPagina.includes(prestadorGuardado);

                    if (coincideServicio && coincidePrestador && coincideFecha && coincideHora) {
                        turnos[i].estado = "CONFIRMADO";
                        turnos[i].turnoId = turnoId; // Guardado con la nueva clave

                        const baseUrl = window.location.origin;
                        turnos[i].linkAnularTurno = `${baseUrl}/#!Turn/TurnNullify/${turnoId}`;

                        modificado = true;
                        console.log("Extensión: Match exitoso. Link de anulación generado:", turnos[i].linkAnularTurno);
                        break;
                    }
                }
            }

            if (modificado) {
                chrome.storage.local.set({ turnos });
            } else {
                console.warn("Extensión: Pantalla de éxito detectada, pero los datos normalizados no coincidieron con ningún registro pendiente.");
            }
        });
    } catch (error) {
        console.warn("Extensión: Timeout esperando confirmación en el DOM.");
    }
}

async function verifyAppointmentNullified() {
    try {
        const contenedor = await waitForElement('#contentLoad') as HTMLElement;
        if (contenedor.innerText.includes("no existe o ya fue anulado")) {
            const match = window.location.href.match(/TurnNullify\/(\d+)/);
            if (match && match[1]) {
                updateAppointmentState(match[1], "ANULADO");
            }
        }
    } catch (error) {
        // Ignoramos, significa que el turno sí existe y la persona tiene que hacer clic en anular
    }
}

function updateAppointmentState(turnoId: string, nuevoEstado: string) {
    chrome.storage.local.get({ turnos: [] }, (result: any) => {
        const turnos = result.turnos;
        const index = turnos.findIndex((t: any) => t.turnoId === turnoId);

        if (index !== -1) {
            turnos[index].estado = nuevoEstado;
            chrome.storage.local.set({ turnos }, () => {
                console.log(`Extensión: Turno ${turnoId} actualizado a ${nuevoEstado}`);
            });
        }
    });
}

// ==========================================
// 5. Custom 'Select All' Toggle Injection (MutationObserver)
// ==========================================
let listObserver: MutationObserver | null = null;

async function executeSelectAllTimeSlotsToggleInjection() {
    clearPreviousInjection();
    if (listObserver) listObserver.disconnect();

    try {
        const col1 = await waitForElement('#itemsGridCol1');
        const firstListRow = col1.closest('.row') as HTMLElement;
        if (!firstListRow) return;

        listObserver = new MutationObserver(() => checkToggleExists(firstListRow));
        listObserver.observe(firstListRow, { childList: true, subtree: true });

        checkToggleExists(firstListRow); // Evaluación inicial
    } catch (e) {
        console.log("Extensión: No se encontró la grilla de turnos.");
    }
}

function checkToggleExists(firstListRow: HTMLElement) {
    const availableAppointmentsExist = firstListRow.querySelectorAll('.entity-list .entity-list-item').length > 0;
    const selectAllAppointmentTimeSlotsToggleExists = !!document.querySelector('.daspu-extension-wrapper');

    if (availableAppointmentsExist && !selectAllAppointmentTimeSlotsToggleExists) {
        const wrapper = document.createElement('div');
        wrapper.className = 'daspu-extension-wrapper';
        wrapper.innerHTML = `
            <div class="toggle-row" style="margin: 10px 0;">
                <button type="button" class="btn btn-primary btn-sm" id="btnSelectAllSlots">
                    Seleccionar Todos
                </button>
            </div>
        `;
        firstListRow.after(wrapper);

        document.getElementById('btnSelectAllSlots')?.addEventListener('click', () => {
            const toggles = document.querySelectorAll('button[onclick^="establecerValorSeleccionado"]') as NodeListOf<HTMLButtonElement>;
            toggles.forEach(t => t.click());
        });
    } else if (!availableAppointmentsExist && selectAllAppointmentTimeSlotsToggleExists) {
        clearPreviousInjection();
    }
}

function clearPreviousInjection() {
    document.querySelector('.daspu-extension-wrapper')?.remove();
}

// ==========================================
// 6. UTILS
// ==========================================

function waitForElement(selector: string, timeout = 5000): Promise<Element> {
    return new Promise((resolve, reject) => {
        const el = document.querySelector(selector);
        if (el) return resolve(el);

        const observer = new MutationObserver(() => {
            const element = document.querySelector(selector);
            if (element) {
                observer.disconnect();
                resolve(element);
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });

        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout de ${timeout}ms esperando: ${selector}`));
        }, timeout);
    });
}