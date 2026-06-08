<template>
  <div class="popup-container">
    <h2>Mis próximos Turnos de Daspu:</h2>

    <div v-if="turnos" id="listaTurnos">
      <div v-for="turno in turnos" :key="turno.id" class="turno-card">
        <div class="fecha-header">{{ formatISODateToLocalDateString(turno.fechaTurnoUTC) }}</div>
        <div style="margin-bottom: 4px;"><strong>{{ turno.servicio }}</strong></div>
        <div style="color: #2c3e50;">{{ turno.prestador }}</div>
        <div style="color: #7f8c8d; font-size: 11px; margin-top: 4px;">Sede: {{ turno.ubicacion }}</div>
        <div style="color: #7f8c8d; font-size: 11px;">Email: {{ turno.email }}</div>

        <div class="estado-container">
          <span class="estado" :class="{
            'pendiente': turno.estado === AppointmentStates.Pending,
            'confirmado': turno.estado === AppointmentStates.Confirmed
          }">
            {{ turno.estado === AppointmentStates.Confirmed ? 'CONFIRMADO' : 'PENDIENTE DE CONFIRMACION' }}
          </span>
        </div>
      </div>
    </div>
    <div v-else>
      <div style="text-align:center; color:#a4b0be; padding:20px; font-style:italic;">No hay turnos registrados</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onMounted } from 'vue';
import { formatISODateToLocalDateString } from '../utils/dateFormatter';
import { AppointmentStates } from '../models/AppointmentStates';
import type Appointment from '../models/Appointment';
import './Popup.css'
// import { usePatientStore } from '../store/usePatientStore';

// const patientStore = usePatientStore();

onMounted(() => {
  getTurnos();
});

const turnos = ref<Appointment[]>([]);

const getTurnos = () => {
  chrome.storage.local.get({ turnos: [] }, (result: { turnos: Appointment[] }) => {
    const curatedData = result.turnos.map((turno) => {
      return {
        ...turno,
        id: turno.id || crypto.randomUUID()
      }
    })

    if (JSON.stringify(curatedData) !== JSON.stringify(result.turnos)) {
      chrome.storage.local.set({ turnos: curatedData });
    }

    turnos.value = curatedData.filter(x => x.estado !== AppointmentStates.Canceled);
  })
};

</script>