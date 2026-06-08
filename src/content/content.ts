// import './content.css';

import cssFile from "./content.css?raw";

const style = document.createElement("style");
style.textContent = cssFile;
document.head.append(style);

import type Appointment from "../models/Appointment";
import { AppointmentStates } from "../models/AppointmentStates";
import PatientService from '../services/PatientService'
import { getDestructuredLocalDateTime, parseLocalDateTimeToISO } from "../utils/dateFormatter";

console.log("DASPU Helper: Content Script initialized.");

// ==========================================
// 1. GLOBAL SESSION STATE
// ==========================================
let temporaryEmail: string = "No especificado";
// let listObserver: MutationObserver | null = null;

// Since DASPU is a SPA, we listen to hash changes to trigger reading logics
// ==========================================
// 2. SPA ROUTER 
// ==========================================

async function handleRouteChange(): Promise<void> {
    const url = window.location.href;
    console.log("DASPU Router: Evaluando ruta actual...", url);

    try {
        if (url.includes("Turn/TurnData")) {
            gestionarInyeccion();
        }
        else if (url.includes("Turn/TurnConfirmation")) {
            await confirmAppointment(url);
        }
        else if (url.includes("Turn/TurnNullify")) {
            await verifyAppointmentNullified();
        }
    } catch (error) {
        console.error("DASPU Router: Error al manejar la ruta:", error);
    }
}

// Inicialización para cubrir todos los escenarios de navegación
handleRouteChange();
window.addEventListener("hashchange", handleRouteChange);
window.addEventListener("load", handleRouteChange);

// ==========================================
// 3. GLOBAL EVENT DELEGATION (Clicks)
// ==========================================
document.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // --- A. Permanent Email Capture ---
    const inputEmail = document.getElementById('txtEmail') as HTMLInputElement | null;
    if (inputEmail && inputEmail.value.trim() !== "") {
        temporaryEmail = inputEmail.value.trim();
    }

    // --- B. 'Siguiente' button (Save Patient's Record) ---
    const nextButton = target.closest('#btnSiguiente');
    if (nextButton && window.location.href.includes("Turn/IndicatePatient")) {
        const patientRecordId = (document.getElementById('hdnFichaId') as HTMLInputElement)?.value;
        if (patientRecordId) {
            savePatientRecordInStorage(patientRecordId);
        }
    }

    // --- C. 'Confirmar' button from final Modal (Save Appointment in 'Pending' status initially) ---
    const confirmButton = target.closest('button[onclick*="confirmarTurno"]');
    if (confirmButton) {
        saveAppointment();
    }

    // --- D. 'Anular' button (TurnNullify) ---
    const nullifyButton = target.closest('#btnAnular');
    if (nullifyButton) {
        const appointmentId = (document.getElementById('hdnTurnoId') as HTMLInputElement)?.value;
        if (appointmentId) updateAppointmentState(appointmentId, "ANULADO");
    }

    // --- E. 'Buscar' button Auto-complete patient info if available already.
    const btnBuscar = target.closest('#btnBuscar'); // Ajustá el ID si es otro

    if (btnBuscar && window.location.href.includes("Turn/IndicatePatient")) {
        waitForBasicPatientInfoAndAutoComplete();
    }
}, true); // Use capture phase

function waitForBasicPatientInfoAndAutoComplete() {
    const apellidoInput = document.getElementById('txtApellido') as HTMLInputElement;
    if (!apellidoInput) return;

    let attempts = 0;
    const interval = setInterval(async () => {
        attempts++;

        if (apellidoInput.value.trim() !== '') {
            clearInterval(interval);
            console.log("DASPU Helper: Datos básicos cargados, autocompletando extra...");

            await autoCompletePatientContactInfo();

        } else if (attempts > 50) {
            // Timeout de 5 segundos (50 * 100ms) por si la búsqueda falla o el DNI no existe
            clearInterval(interval);
            console.log("DASPU Helper: Timeout esperando datos del paciente.");
        }
    }, 100);
}

async function autoCompletePatientContactInfo() {
    const patientRecordId = (document.getElementById('hdnFichaId') as HTMLInputElement)?.value;
    if (!patientRecordId) return;

    const pacienteGuardado = await PatientService.getByPatientRecordId(patientRecordId);

    if (pacienteGuardado) {
        const autocompletarInput = (idHTML: string, valor: string | undefined | null) => {
            // Casteamos a HTMLInputElement para que TS no se queje de la propiedad .value
            const input = document.getElementById(idHTML) as HTMLInputElement | null;

            if (input && valor) {
                input.value = valor;

                // Disparamos estos eventos para engañar a la validación de la página
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                input.dispatchEvent(new Event('blur', { bubbles: true })); // <-- Clave para DASPU
            }
        };

        autocompletarInput('txtTelefono', pacienteGuardado.telefono);
        autocompletarInput('txtCodArea', pacienteGuardado.codArea);
        autocompletarInput('txtCelular', pacienteGuardado.celular);
        autocompletarInput('txtEmail', pacienteGuardado.email);

        autoCompleteDropdownObraSocial();
    }
}

function autoCompleteDropdownObraSocial() {
    // 1. Casteamos el dropdown como HTMLSelectElement desde el inicio
    const ddl = document.getElementById('ddlObraSocial') as HTMLSelectElement | null;
    if (!ddl) return;

    const expectedObraSocialValue = '8066';
    const obraSocialTextToSearch = "DASPU";

    // 2. La opción buscada es un HTMLOptionElement (o null si no se encuentra)
    let optionFound: HTMLOptionElement | null | undefined = ddl.querySelector(`option[value="${expectedObraSocialValue}"]`);

    // 3. Si no existe, buscamos en los textos. Array.from ahora funciona porque ddl sabe que tiene .options
    if (!optionFound) {
        optionFound = Array.from(ddl.options).find(opt =>
            opt.text.trim().toUpperCase().includes(obraSocialTextToSearch.toUpperCase())
        );
    }

    // 4. Si encontramos la opción, asignamos su valor al select principal
    if (optionFound) {
        ddl.value = optionFound.value; // Ahora TS sabe que ddl tiene la propiedad .value

        // Disparamos eventos para que la web de DASPU se entere del cambio
        ddl.dispatchEvent(new Event('change', { bubbles: true }));
        ddl.dispatchEvent(new Event('blur', { bubbles: true }));

        console.log("Extensión: Obra Social auto-seleccionada:", optionFound.text);
    }
}

// ==========================================
// 4. BUSINESS LOGIC FUNCTIONS
// ==========================================

function savePatientRecordInStorage(patientRecordId: string) {
    const patientRecordData = {
        tipoDocumento: (document.getElementById('ddlTipoDoc') as HTMLSelectElement)?.value || '',
        nroDocumento: (document.getElementById('txtNroDocumento') as HTMLInputElement)?.value.trim() || '',
        telefono: (document.getElementById('txtTelefono') as HTMLInputElement)?.value.trim() || '',
        codArea: (document.getElementById('txtCodArea') as HTMLInputElement)?.value.trim() || '',
        celular: (document.getElementById('txtCelular') as HTMLInputElement)?.value.trim() || '',
        email: (document.getElementById('txtEmail') as HTMLInputElement)?.value.trim() || ''
    };

    const storageKey = `fichaPaciente${patientRecordId}`;
    chrome.storage.local.set({ [storageKey]: patientRecordData }, () => {
        console.log(`Extension: Patient record saved locally (${storageKey})`, patientRecordData);
    });
}

function saveAppointment() {
    try {
        const appointmentData: Appointment = {
            id: crypto.randomUUID(),
            fechaCreacionTurnoUTC: new Date().toISOString(),
            fechaTurnoUTC: parseLocalDateTimeToISO(
                document.getElementById('turnoFechaHora')?.innerText?.trim() || ''
            ),
            email: temporaryEmail,
            servicio: document.getElementById('turnoServicio')?.innerText.trim() || '',
            prestador: document.getElementById('turnoPrestador')?.innerText.trim() || '',
            ubicacion: document.getElementById('turnoUbicacion')?.innerText.trim() || '',
            observaciones: (document.getElementById('txtObservaciones') as HTMLTextAreaElement)?.value.trim() || '',
            estado: AppointmentStates.Pending
        };

        chrome.storage.local.get({ turnos: [] }, (result: { turnos: any[] }) => {
            const updatedAppointments = [...result.turnos, appointmentData];
            chrome.storage.local.set({ turnos: updatedAppointments }, () => {
                console.log("Extension: PENDING Appointment saved.", appointmentData);
            });
        });
    } catch (err) {
        console.error("Error extracting data from modal:", err);
    }
}

async function confirmAppointment(url: string) {
    try {
        const hiddenAppointmentId = await waitForElement('#hdnTurnoId') as HTMLInputElement;
        const pageText = document.body.innerText.toLowerCase();

        if (!pageText.includes("turno confirmado")) return;

        const appointmentId = hiddenAppointmentId.value || url.match(/Turn\/TurnConfirmation\/(\d+)/)?.[1];
        console.log(`Extension: Data ready! Processing Appointment ID: ${appointmentId}`);

        const normalizedPageText = pageText.replace(/\s+/g, ' ').toUpperCase();

        chrome.storage.local.get({ turnos: [] }, (result: { turnos: any[] }) => {
            let storedAppointments = [...result.turnos];
            let isModified = false;

            for (let i = storedAppointments.length - 1; i >= 0; i--) {
                if (storedAppointments[i].estado === AppointmentStates.Pending) {

                    const storedService = storedAppointments[i].servicio.replace(/\s+/g, ' ').toUpperCase();
                    const storedProvider = storedAppointments[i].prestador.replace(/\s+/g, ' ').toUpperCase();

                    const { date, time } = getDestructuredLocalDateTime(storedAppointments[i].fechaTurnoUTC);
                    const dbAppointmentLocalDate = date;
                    const dbAppointmentLocalTime = time;

                    const dateMatches = dbAppointmentLocalDate && normalizedPageText.includes(dbAppointmentLocalDate);
                    const timeMatches = dbAppointmentLocalTime && normalizedPageText.includes(dbAppointmentLocalTime);

                    const serviceMatches = normalizedPageText.includes(storedService);
                    const providerMatches = normalizedPageText.includes(storedProvider);

                    if (serviceMatches && providerMatches && dateMatches && timeMatches) {
                        storedAppointments[i].estado = AppointmentStates.Confirmed;
                        storedAppointments[i].turnoId = appointmentId;

                        const baseUrl = window.location.origin;
                        storedAppointments[i].linkAnularTurno = `${baseUrl}/#!Turn/TurnNullify/${appointmentId}`;

                        isModified = true;
                        console.log("Extension: Successful match. Nullify link generated:", storedAppointments[i].linkAnularTurno);
                        break;
                    }
                }
            }

            if (isModified) {
                chrome.storage.local.set({ turnos: storedAppointments });
            } else {
                console.warn("Extension: Success screen detected, but normalized data did not match any pending record.");
            }
        });
    } catch (error) {
        console.warn("Extension: Timeout waiting for confirmation in the DOM.");
    }
}

async function verifyAppointmentNullified() {
    try {
        const contentContainer = await waitForElement('#contentLoad') as HTMLElement;
        if (contentContainer.innerText.includes("no existe o ya fue anulado")) {
            const match = window.location.href.match(/TurnNullify\/(\d+)/);
            if (match && match[1]) {
                updateAppointmentState(match[1], AppointmentStates.Canceled);
            }
        }
    } catch (error) {
        // Ignored; it means the appointment exists and the user must click "Anular"
    }
}

function updateAppointmentState(appointmentId: string, newState: string) {
    chrome.storage.local.get({ turnos: [] }, (result: { turnos: any[] }) => {
        const storedAppointments = result.turnos;
        const index = storedAppointments.findIndex((t: any) => t.turnoId === appointmentId);

        if (index !== -1) {
            storedAppointments[index].estado = newState;
            chrome.storage.local.set({ turnos: storedAppointments }, () => {
                console.log(`Extension: Appointment ${appointmentId} updated to ${newState}`);
            });
        }
    });
}

// ==========================================
// 6. AGREGAR Toggle "Seleccionar Todos" (TypeScript Version)
// ==========================================

let observadorGrilla: MutationObserver | null = null;

// Inicialización de eventos
window.addEventListener('hashchange', gestionarInyeccion);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', gestionarInyeccion);
} else {
    gestionarInyeccion();
}

function gestionarInyeccion(): void {
    limpiarInyeccionPrevia();
    detenerObservadorGrilla();

    // Verificamos si estamos en la ruta correcta
    if (!window.location.hash.includes("Turn/TurnData")) {
        return;
    }

    waitForElementToggle('#itemsGridCol1', (col1: HTMLElement) => {
        const filaOriginal = col1.closest('.row') as HTMLElement | null;
        if (!filaOriginal) return;

        iniciarObservadorGrilla(filaOriginal);
        evaluarPresenciaDeToggle(filaOriginal);
    });
}

function iniciarObservadorGrilla(filaOriginal: HTMLElement): void {
    observadorGrilla = new MutationObserver(() => {
        evaluarPresenciaDeToggle(filaOriginal);
    });

    observadorGrilla.observe(filaOriginal, {
        childList: true,
        subtree: true
    });
}

function evaluarPresenciaDeToggle(filaOriginal: HTMLElement): void {
    const hayTurnos = tieneSlotsDisponibles(filaOriginal);
    const toggleExiste = !!document.querySelector('.daspu-extension-wrapper');

    if (hayTurnos && !toggleExiste) {
        const wrapperMadre = createToggleSeleccionarTodos();
        filaOriginal.after(wrapperMadre);
        console.log("DASPU Helper: Turnos detectados. Toggle inyectado.");
    } 
    else if (!hayTurnos && toggleExiste) {
        limpiarInyeccionPrevia();
        console.log("DASPU Helper: La grilla se vació. Toggle removido.");
    }
}

function detenerObservadorGrilla(): void {
    if (observadorGrilla) {
        observadorGrilla.disconnect();
        observadorGrilla = null;
    }
}

function tieneSlotsDisponibles(contenedor: HTMLElement): boolean {
    const items = contenedor.querySelectorAll('.entity-list .entity-list-item');
    return items.length > 0;
}

function createToggleSeleccionarTodos(): HTMLElement {
    const wrapperMadre = document.createElement('div');
    wrapperMadre.className = 'daspu-extension-wrapper';
    wrapperMadre.innerHTML = `
        <div class="toggle-row">
            <label class="label-selector">Seleccionar Todos</label>
            <button type="button" 
                    data-toggle="button" 
                    class="btn btn-toggle-switch" 
                    autocomplete="off" 
                    aria-pressed="false">
            </button>
        </div>
    `;

    const newToggle = wrapperMadre.querySelector('.btn-toggle-switch') as HTMLButtonElement;
    if (newToggle) {
        newToggle.addEventListener('click', selectAllTurnSlots);
    }
    return wrapperMadre;
}

function selectAllTurnSlots(): void {
    // Buscamos los botones que el sitio usa para seleccionar
    const toggles = document.querySelectorAll('button[onclick^="establecerValorSeleccionado"]');
    toggles.forEach((toggle) => {
        const btn = toggle as HTMLButtonElement;
        btn.click();
    });
}

// Helper tipado para esperar elementos
function waitForElementToggle(selector: string, callback: (el: HTMLElement) => void): void {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (element) {
        callback(element);
        return;
    }

    const observer = new MutationObserver((_mutations, obs) => {
        const el = document.querySelector(selector) as HTMLElement | null;
        if (el) {
            obs.disconnect();
            callback(el);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

function limpiarInyeccionPrevia(): void {
    const contenedorExistente = document.querySelector('.daspu-extension-wrapper');
    if (contenedorExistente) {
        contenedorExistente.remove();
    }
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
            reject(new Error(`Timeout of ${timeout}ms waiting for: ${selector}`));
        }, timeout);
    });
}