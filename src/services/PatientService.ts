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
    }
};

export default PatientService;

