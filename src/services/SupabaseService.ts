import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type Appointment from '../models/Appointment';

interface AppointmentPayload {
    fichaPacienteId: number | null;
    fechaCreacionTurnoUTC: string;
    fechaTurnoUTC: string;
    email: string;
    celular?: string;
    servicio: string;
    prestador: string;
    ubicacion: string;
    estado: string;
    observaciones?: string | null;
    turnoId?: number | null;
}

let supabaseClient: SupabaseClient | null = null;

const SupabaseService = {
    getConfig: () => {
        // Usamos 'any' para evitar errores de tipo si no quieres declarar interfaces complejas
        const manifest = chrome.runtime.getManifest() as any;
        return {
            url: manifest.supabase?.url,
            anonKey: manifest.supabase?.anon_key
        };
    },
    initialize: (): SupabaseClient => {
        if (!supabaseClient) {
            const { url, anonKey } = SupabaseService.getConfig();
            supabaseClient = createClient(url, anonKey);
            console.log('SupabaseService: Client initialized');
        }
        return supabaseClient;
    },
    getClient: (): SupabaseClient => {
        if (!supabaseClient) {
            return SupabaseService.initialize();
        }
        return supabaseClient;
    },

    /**
     * TEMPORARY: Enrich appointment with missing fields before Supabase sync
     * Fetches fichaPacienteId and celular from local storage if not present
     * TODO: Remove this function after local data has been patched
     */
    enrichAppointmentData: async (appointment: Appointment): Promise<Appointment> => {
        const enriched = { ...appointment };

        try {
            // TEMPORARY: Try to find patient record by matching email
            // This helps link appointments to fichaPaciente records when fichaPacienteId wasn't saved
            if (!enriched.fichaPacienteId) {
                const result = await new Promise<Record<string, any>>((resolve) => {
                    chrome.storage.local.get(null, (allData) => {
                        resolve(allData);
                    });
                });

                const patientKeys = Object.keys(result).filter(key => key.startsWith('fichaPaciente'));
                
                // Try to match by email first
                for (const key of patientKeys) {
                    const patientRecord = result[key];
                    if (patientRecord && patientRecord.email === enriched.email) {
                        const fichaPacienteId = parseInt(key.replace('fichaPaciente', ''));
                        enriched.fichaPacienteId = fichaPacienteId;
                        
                        // Extract celular from matched patient record
                        if (patientRecord.celular) {
                            enriched.celular = patientRecord.celular;
                            console.log(`SupabaseService: Matched patient record ${fichaPacienteId} by email, enriched with celular`);
                        }
                        break;
                    }
                }

                // If no match by email, use the most recent patient record (as fallback)
                if (!enriched.fichaPacienteId && patientKeys.length > 0) {
                    const mostRecentKey = patientKeys[patientKeys.length - 1];
                    const patientRecord = result[mostRecentKey];
                    const fichaPacienteId = parseInt(mostRecentKey.replace('fichaPaciente', ''));
                    
                    enriched.fichaPacienteId = fichaPacienteId;
                    if (patientRecord && patientRecord.celular) {
                        enriched.celular = patientRecord.celular;
                        console.warn(`SupabaseService: Using most recent patient record ${fichaPacienteId} as fallback for fichaPacienteId`);
                    }
                }
            } else if (enriched.fichaPacienteId && !enriched.celular) {
                // If fichaPacienteId exists but celular is missing, fetch it
                const patientKey = `fichaPaciente${enriched.fichaPacienteId}`;
                const result = await new Promise<any>((resolve) => {
                    chrome.storage.local.get(patientKey, (data) => {
                        resolve(data[patientKey] || null);
                    });
                });

                if (result && result.celular) {
                    enriched.celular = result.celular;
                    console.log(`SupabaseService: Enriched appointment with celular from patient record ${enriched.fichaPacienteId}`);
                }
            }

            if (!enriched.celular) {
                enriched.celular = '';
                console.warn('SupabaseService: Using empty string for missing celular field');
            }

            return enriched;
        } catch (error) {
            console.warn('SupabaseService: Error enriching appointment data, using defaults:', error);
            return {
                ...enriched,
                celular: enriched.celular || ''
            };
        }
    },
    appointmentExists: async (appointment: Appointment): Promise<boolean> => {
        const client = SupabaseService.getClient();

        try {
            // If appointment has turnoId (confirmed), search by that
            if (appointment.turnoId) {
                const { data, error } = await client
                    .from('Appointment')
                    .select('id')
                    .eq('turnoId', appointment.turnoId)
                    .limit(1);

                if (error) throw error;
                return data && data.length > 0;
            }

            // For pending appointments, search by servicio + fechaTurnoUTC + prestador
            // to avoid duplicates
            const { data, error } = await client
                .from('Appointment')
                .select('id')
                .eq('servicio', appointment.servicio)
                .eq('prestador', appointment.prestador)
                .eq('fechaTurnoUTC', appointment.fechaTurnoUTC)
                .limit(1);

            if (error) throw error;
            return data && data.length > 0;
        } catch (error) {
            console.error('SupabaseService: Error checking appointment existence:', error);
            return false;
        }
    },
    insertAppointment: async (appointment: Appointment): Promise<boolean> => {
        try {
            // TEMPORARY: Enrich appointment with missing fields
            const enrichedAppointment = await SupabaseService.enrichAppointmentData(appointment);

            const exists = await SupabaseService.appointmentExists(enrichedAppointment);
            if (exists) {
                console.log('SupabaseService: Appointment already exists, skipping insert:', enrichedAppointment.servicio);
                return true;
            }

            const client = SupabaseService.getClient();

            const payload: AppointmentPayload = {
                fichaPacienteId: enrichedAppointment.fichaPacienteId || null,
                fechaCreacionTurnoUTC: enrichedAppointment.fechaCreacionTurnoUTC,
                fechaTurnoUTC: enrichedAppointment.fechaTurnoUTC,
                email: enrichedAppointment.email,
                celular: enrichedAppointment.celular || '',
                servicio: enrichedAppointment.servicio,
                prestador: enrichedAppointment.prestador,
                ubicacion: enrichedAppointment.ubicacion,
                estado: enrichedAppointment.estado,
                observaciones: enrichedAppointment.observaciones || null,
                turnoId: enrichedAppointment.turnoId || null
            };

            const { data: _data, error } = await client
                .from('Appointment')
                .insert([payload])
                .select();

            if (error) {
                console.error('SupabaseService: Error inserting appointment:', error);
                return false;
            }

            console.log('SupabaseService: Appointment inserted successfully:', enrichedAppointment.servicio);
            return true;
        } catch (error) {
            console.error('SupabaseService: Exception inserting appointment:', error);
            return false;
        }
    },
    updateAppointment: async (appointment: Appointment): Promise<boolean> => {
        try {
            // TEMPORARY: Enrich appointment with missing fields
            const enrichedAppointment = await SupabaseService.enrichAppointmentData(appointment);

            const client = SupabaseService.getClient();

            const payload: Partial<AppointmentPayload> = {
                estado: enrichedAppointment.estado,
                observaciones: enrichedAppointment.observaciones || null,
                turnoId: enrichedAppointment.turnoId || null
            };

            // Update by turnoId if available, otherwise by the combination of identifying fields
            let query = client
                .from('Appointment')
                .update(payload);

            if (enrichedAppointment.turnoId) {
                query = query.eq('turnoId', enrichedAppointment.turnoId);
            } else {
                query = query
                    .eq('servicio', enrichedAppointment.servicio)
                    .eq('prestador', enrichedAppointment.prestador)
                    .eq('fechaTurnoUTC', enrichedAppointment.fechaTurnoUTC);
            }

            const { error } = await query;

            if (error) {
                console.error('SupabaseService: Error updating appointment:', error);
                return false;
            }

            console.log('SupabaseService: Appointment updated successfully:', enrichedAppointment.servicio);
            return true;
        } catch (error) {
            console.error('SupabaseService: Exception updating appointment:', error);
            return false;
        }
    },
    syncAllAppointments: async (appointments: Appointment[]): Promise<number> => {
        console.log(`SupabaseService: Starting sync of ${appointments.length} appointments`);

        let syncedCount = 0;

        for (const appointment of appointments) {
            const success = await SupabaseService.insertAppointment(appointment);
            if (success) syncedCount++;
        }

        console.log(`SupabaseService: Sync completed. ${syncedCount}/${appointments.length} appointments synced`);
        return syncedCount;
    },
    syncAppointment: async (appointment: Appointment): Promise<boolean> => {
        // If it has a turnoId, it's confirmed and should be updated
        if (appointment.turnoId) {
            return SupabaseService.updateAppointment(appointment);
        }

        return SupabaseService.insertAppointment(appointment);
    }
};

export default SupabaseService;
export type { AppointmentPayload };
