import type Appointment from "../models/Appointment";

const AppointmentService = {
    updateAppointmentState: async (appointmentId: number, newState: string) : Promise<void> => {
        const results = await chrome.storage.local.get({ turnos: [] }) as { turnos: Appointment[]};
        if (!results || !results.turnos) return;

        const storedAppointments = results.turnos;
        const index = storedAppointments.findIndex((t: any) => t.turnoId === appointmentId);

        if (index !== -1) {
            storedAppointments[index].estado = newState;
            storedAppointments[index].fechaUltimaModificacionUTC = new Date().toISOString();
            chrome.storage.local.set({ turnos: storedAppointments }, () => {
                console.log(`Extension: Appointment ${appointmentId} updated to ${newState}`);
            });
            // ⚠️ NOTE: Supabase sync is handled automatically by chrome.storage.onChanged listener in popup.vue
        }
    }
}

export default AppointmentService;