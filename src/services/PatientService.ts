import type PatientRecord from '../models/PatientRecord';

const PatientService = {
    getByPatientRecordId: async (id: string): Promise<PatientRecord | null> => {
        const patientRecordKey = `fichaPaciente${id}`
        const result = await chrome.storage.local.get(patientRecordKey);

        const patientRecord = result[patientRecordKey];

        if (patientRecord) {
            const data = patientRecord as PatientRecord;
            return data;
        }

        return null;
    },
    savePatientRecordInStorage: async (patientRecordId: string, patientRecord: PatientRecord): Promise<void> => {
        try {
            const storageKey = `fichaPaciente${patientRecordId}`;
            await chrome.storage.local.set({ [storageKey]: patientRecord });
            console.log(`Extension: Patient record saved locally (${storageKey})`, patientRecord);
        } catch (error) {
            console.error(`Extension Error saving patient record:`, error);
        }
    }
};

export default PatientService;

