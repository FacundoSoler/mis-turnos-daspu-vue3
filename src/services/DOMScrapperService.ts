import type Appointment from "../models/Appointment";
import type PatientRecord from "../models/PatientRecord";
import { AppointmentStates } from "../models/AppointmentStates";
import { getDestructuredLocalDateTime, parseLocalDateTimeToISO } from "../utils/dateFormatter";
import PatientService from "./PatientService";
import AppointmentService from "./AppointmentService";

let observadorGrilla: MutationObserver | null = null;

const DOMScrapperService = {
    confirmAppointment: async (url: string): Promise<void> => {
        try {
            const hiddenAppointmentId = await waitForElement('#hdnTurnoId') as HTMLInputElement;
            const pageText = document.body.innerText.toLowerCase();
            if (!pageText.includes("turno confirmado")) return;

            const appointmentId = hiddenAppointmentId.value || url.match(/Turn\/TurnConfirmation\/(\d+)/)?.[1];
            if (!appointmentId) {
                console.warn("Extension: Could not extract turnoId from page or URL.");
                return;
            }

            const normalizedPageText = pageText.replace(/\s+/g, ' ').toUpperCase();

            const result = await chrome.storage.local.get({ turnos: [] }) as { turnos: Appointment[] };
            const storedAppointments = [...result.turnos];

            for (let i = storedAppointments.length - 1; i >= 0; i--) {
                if (storedAppointments[i].estado !== AppointmentStates.Pending) continue;

                const storedService = storedAppointments[i].servicio.replace(/\s+/g, ' ').toUpperCase();
                const storedProvider = storedAppointments[i].prestador.replace(/\s+/g, ' ').toUpperCase();
                const { date, time } = getDestructuredLocalDateTime(storedAppointments[i].fechaTurnoUTC);

                const serviceMatches = normalizedPageText.includes(storedService);
                const providerMatches = normalizedPageText.includes(storedProvider);
                const dateMatches = date && normalizedPageText.includes(date);
                const timeMatches = time && normalizedPageText.includes(time);

                if (serviceMatches && providerMatches && dateMatches && timeMatches) {
                    storedAppointments[i].estado = AppointmentStates.Confirmed;
                    storedAppointments[i].fechaUltimaModificacionUTC = new Date().toISOString();
                    storedAppointments[i].turnoId = parseInt(appointmentId);
                    chrome.storage.local.set({ turnos: storedAppointments });
                    return;
                }
            }

            console.warn("Extension: Success screen detected, but normalized data did not match any pending record.");
        } catch {
            console.warn("Extension: Timeout waiting for confirmation in the DOM.");
        }
    },
    saveAppointment: async (email: string): Promise<void> => {
        try {
            const fechaCreacionTurnoUTC = new Date().toISOString();

            const appointmentData: Appointment = {
                id: crypto.randomUUID(),
                fechaCreacionTurnoUTC: fechaCreacionTurnoUTC,
                fechaUltimaModificacionUTC: fechaCreacionTurnoUTC,
                fechaTurnoUTC: parseLocalDateTimeToISO(getElementText('turnoFechaHora')),
                email: email,
                celular: getInputValue('txtCelular'),
                servicio: getElementText('turnoServicio'),
                prestador: getElementText('turnoPrestador'),
                ubicacion: getElementText('turnoUbicacion'),
                observaciones: getInputValue('txtObservaciones'),
                estado: AppointmentStates.Pending,
                fichaPacienteId: parseInt(getInputValue('hdnFichaId')) || undefined,
            };

            const appointments = await chrome.storage.local.get({ turnos: [] }) as { turnos: Appointment[] };
            const updatedAppointments = [...appointments.turnos, appointmentData];

            // Save to local storage. This triggers chrome.storage.onChanged listener in popup.vue
            // which will auto-sync to Supabase if user is logged in
            chrome.storage.local.set({ turnos: updatedAppointments });
        } catch (err) {
            console.error("Error extracting data from modal:", err);
        }
    },
    cancelAppointment: async (): Promise<void> => {
        try {
            const appointmentId = getInputValue('hdnTurnoId');
            if (appointmentId) {
                const turnoId = parseInt(appointmentId);
                if (!isNaN(turnoId)) {
                    await AppointmentService.updateAppointmentState(turnoId, AppointmentStates.Canceled);
                } else {
                    console.warn("Extension: Invalid turnoId format:", appointmentId);
                }
            }
        } catch (error) {
            console.error("Extension: Error nullifying appointment:", error);
        }
    },
    verifyCanceledAppointment: async (): Promise<void> => {
        try {
            //const contentContainer = await waitForElement('#contentLoad') as HTMLElement;
            const contentContainer = await waitForElement('#Notification') as HTMLElement;
            if (contentContainer.innerText.includes("no existe o ya fue anulado")) {
                const match = window.location.href.match(/TurnNullify\/(\d+)/);
                if (match?.[1]) await AppointmentService.updateAppointmentState(parseInt(match[1]), AppointmentStates.Canceled);
            }
        } catch {
            // Ignored; it means the appointment exists and the user must click "Anular"
        }
    },
    waitForBasicPatientInfoAndAutoComplete: () => {
        const apellidoInput = document.getElementById('txtApellido') as HTMLInputElement | null;
        if (!apellidoInput) return;

        let attempts = 0;
        const interval = setInterval(async () => {
            attempts++;
            if (apellidoInput.value.trim() !== '') {
                clearInterval(interval);
                console.log("DASPU Helper: Datos básicos cargados, autocompletando extra...");
                await autoCompletePatientContactInfo();
            } else if (attempts > 50) {
                // Timeout of 5s (50 * 100ms) in case the search fails or the DNI doesn't exist
                clearInterval(interval);
                console.log("DASPU Helper: Timeout esperando datos del paciente.");
            }
        }, 100);
    },
    injectSelectAlltoggle: () => { // Seleccionar Todos toggle
        limpiarInyeccionPrevia();
        detenerObservadorGrilla();

        if (!window.location.hash.includes("Turn/TurnData")) return;

        waitForElement('#itemsGridCol1').then((col1) => {
            const filaOriginal = (col1 as HTMLElement).closest('.row') as HTMLElement | null;
            if (!filaOriginal) return;

            iniciarObservadorGrilla(filaOriginal);
            evaluarPresenciaDeToggle(filaOriginal);
        }).catch(() => {
            console.log("DASPU Helper: Timeout waiting for #itemsGridCol1.");
        });
    },
    temporaryRetainContactEmail: () => {
        const emailValue = getInputValue('txtEmail');
        if (emailValue) {
            return emailValue;
        }

        return 'No especificado';
    },
    savePatientRecord: async () => {
        const patientRecordId = getInputValue('hdnFichaId');
        if (patientRecordId) {
            const PatientRecord: PatientRecord = {
                tipoDocumento: parseInt(getSelectValue('ddlTipoDoc')),
                nroDocumento: getInputValue('txtNroDocumento'),
                telefono: getInputValue('txtTelefono'),
                codArea: getInputValue('txtCodArea'),
                celular: getInputValue('txtCelular'),
                email: getInputValue('txtEmail'),
            };

            await PatientService.savePatientRecordInStorage(patientRecordId, PatientRecord);
        }
    }
}

const waitForElement = async (selector: string, timeout: number = 5000): Promise<Element> => {
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
};

// ==========================================
// AUTOCOMPLETE
// ==========================================

const autoCompletePatientContactInfo = async (): Promise<void> => {
    const patientRecordId = getInputValue('hdnFichaId');
    if (!patientRecordId) return;

    const storedPatientRecord = await PatientService.getByPatientRecordId(patientRecordId);
    if (!storedPatientRecord) return;

    setInputAndDispatch('txtTelefono', storedPatientRecord.telefono);
    setInputAndDispatch('txtCodArea', storedPatientRecord.codArea);
    setInputAndDispatch('txtCelular', storedPatientRecord.celular);
    setInputAndDispatch('txtEmail', storedPatientRecord.email);

    autoCompleteDropdownObraSocial();
}

const autoCompleteDropdownObraSocial = () => {
    const ddl = document.getElementById('ddlObraSocial') as HTMLSelectElement | null;
    if (!ddl) return;

    // Find by value first, then fall back to text search
    const optionFound =
        ddl.querySelector<HTMLOptionElement>('option[value="8066"]') ??
        Array.from(ddl.options).find(opt => opt.text.trim().toUpperCase().includes('DASPU'));

    if (optionFound) {
        ddl.value = optionFound.value;
        dispatchEvents(ddl, ['change', 'blur']);
        console.log("Extensión: Obra Social auto-seleccionada:", optionFound.text);
    }
}

// ==========================================
// TOGGLE "SELECCIONAR TODOS"
// ==========================================

const iniciarObservadorGrilla = (filaOriginal: HTMLElement) => {
    observadorGrilla = new MutationObserver(() => evaluarPresenciaDeToggle(filaOriginal));
    observadorGrilla.observe(filaOriginal, { childList: true, subtree: true });
}

const evaluarPresenciaDeToggle = (filaOriginal: HTMLElement) => {
    const hayTurnos = filaOriginal.querySelectorAll('.entity-list .entity-list-item').length > 0;
    const toggleExiste = !!document.querySelector('.daspu-extension-wrapper');

    if (hayTurnos && !toggleExiste) {
        filaOriginal.after(createToggleSeleccionarTodos());
    } else if (!hayTurnos && toggleExiste) {
        limpiarInyeccionPrevia();
    }
}

const detenerObservadorGrilla = () => {
    observadorGrilla?.disconnect();
    observadorGrilla = null;
}

const createToggleSeleccionarTodos = (): HTMLElement => {
    const wrapper = document.createElement('div');
    wrapper.className = 'daspu-extension-wrapper';
    wrapper.innerHTML = `
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

    wrapper.querySelector<HTMLButtonElement>('.btn-toggle-switch')
        ?.addEventListener('click', selectAllTurnSlots);

    return wrapper;
}

const selectAllTurnSlots = () => {
    document.querySelectorAll<HTMLButtonElement>('button[onclick^="establecerValorSeleccionado"]')
        .forEach(btn => btn.click());
}

const limpiarInyeccionPrevia = () => {
    document.querySelector('.daspu-extension-wrapper')?.remove();
}

// ==========================================
// HTML HELPERS
// ==========================================

const getInputValue = (id: string): string => {
    return (document.getElementById(id) as HTMLInputElement | null)?.value.trim() ?? '';
}

const getSelectValue = (id: string): string => {
    return (document.getElementById(id) as HTMLSelectElement | null)?.value ?? '';
}

const getElementText = (id: string): string => {
    return (document.getElementById(id) as HTMLElement | null)?.innerText.trim() ?? '';
}

const setInputAndDispatch = (id: string, value: string | undefined | null) => {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (input && value) {
        input.value = value;
        dispatchEvents(input, ['input', 'change', 'blur']);
    }
}

const dispatchEvents = (el: HTMLElement, events: string[]) => {
    events.forEach(type => el.dispatchEvent(new Event(type, { bubbles: true })));
}

export default DOMScrapperService;