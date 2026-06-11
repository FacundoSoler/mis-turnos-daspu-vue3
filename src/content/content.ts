import cssFile from "./content.css?raw";

const style = document.createElement("style");
style.textContent = cssFile;
document.head.append(style);

import DOMScrapperService from "../services/DOMScrapperService";

let temporaryEmail: string = "No especificado";

// ==========================================
// SPA ROUTER
// Since DASPU is a SPA, we listen to hash changes to trigger reading logics
// ==========================================

handleRouteChange();
window.addEventListener("hashchange", handleRouteChange);
window.addEventListener("load", handleRouteChange);

async function handleRouteChange(): Promise<void> {
    const url = window.location.href;

    try {
        if (url.includes("Turn/TurnData")) {
            DOMScrapperService.injectSelectAlltoggle();
        } else if (url.includes("Turn/TurnConfirmation")) {
            await DOMScrapperService.confirmAppointment(url);
        } else if (url.includes("Turn/TurnNullify")) {
            await DOMScrapperService.verifyCanceledAppointment();
        }
    } catch (error) {
        console.error("DASPU Router: Error al manejar la ruta:", error);
    }
}

// ==========================================
// GLOBAL EVENT DELEGATION (Clicks)
// ==========================================
document.addEventListener('click', async (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;

    // --- A. 'Buscar' button — Auto-complete patient info if already stored ---
    if (target.closest('#btnBuscar') && window.location.href.includes("Turn/IndicatePatient")) {
        DOMScrapperService.waitForBasicPatientInfoAndAutoComplete();
    }

    // --- B. 'Siguiente' button (Save Patient's Record) ---
    if (target.closest('#btnSiguiente') && window.location.href.includes("Turn/IndicatePatient")) {
        temporaryEmail = DOMScrapperService.temporaryRetainContactEmail();
        await DOMScrapperService.savePatientRecord();
    }

    // --- C. 'Confirmar' button from final Modal (Save Appointment in 'Pending' status initially) ---
    if (target.closest('button[onclick*="confirmarTurno"]')) {
        await DOMScrapperService.saveAppointment(temporaryEmail);
    }

    // --- D. 'Anular' button (TurnNullify) ---
    if (target.closest('#btnAnular')) {
        await DOMScrapperService.cancelAppointment();
    }
}, true); // Use capture phase

