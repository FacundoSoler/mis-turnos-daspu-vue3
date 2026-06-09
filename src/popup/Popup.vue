<template>
  <div class="popup-container">
    <h2>Mis próximos Turnos de Daspu:</h2>

    <!-- Tab Navigation -->
    <div class="tabs-nav">
      <button 
        :class="['tab-button', { active: activeTab === 'activos' }]"
        @click="activeTab = 'activos'"
      >
        Activos
      </button>
      <button 
        :class="['tab-button', { active: activeTab === 'anulados' }]"
        @click="activeTab = 'anulados'"
      >
        Anulados
      </button>
    </div>

    <!-- Tab Content -->
    <div v-if="allTurnos" id="listaTurnos">
      <!-- Activos Tab -->
      <template v-if="activeTab === 'activos'">
        <div v-if="activosTurnos.length > 0">
          <div v-for="turno in activosTurnos" :key="turno.id" class="turno-card">
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
        <div v-else style="text-align:center; color:#a4b0be; padding:20px; font-style:italic;">
          No hay turnos activos registrados
        </div>
      </template>

      <!-- Anulados Tab -->
      <template v-if="activeTab === 'anulados'">
        <div v-if="anuladosTurnos.length > 0">
          <div v-for="turno in anuladosTurnos" :key="turno.id" class="turno-card anulado">
            <div class="fecha-header">{{ formatISODateToLocalDateString(turno.fechaTurnoUTC) }}</div>
            <div style="margin-bottom: 4px;"><strong>{{ turno.servicio }}</strong></div>
            <div style="color: #2c3e50;">{{ turno.prestador }}</div>
            <div style="color: #7f8c8d; font-size: 11px; margin-top: 4px;">Sede: {{ turno.ubicacion }}</div>
            <div style="color: #7f8c8d; font-size: 11px;">Email: {{ turno.email }}</div>

            <div class="estado-container">
              <span class="estado anulado">ANULADO</span>
            </div>
          </div>
        </div>
        <div v-else style="text-align:center; color:#a4b0be; padding:20px; font-style:italic;">
          No hay turnos anulados registrados
        </div>
      </template>
    </div>
    <div v-else>
      <div style="text-align:center; color:#a4b0be; padding:20px; font-style:italic;">No hay turnos registrados</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onMounted } from 'vue';
import { formatISODateToLocalDateString } from '../utils/dateFormatter';
import { AppointmentStates } from '../models/AppointmentStates';
import type Appointment from '../models/Appointment';
import './Popup.css'

const activeTab = ref<'activos' | 'anulados'>('activos');
const allTurnos = ref<Appointment[]>([]);

const activosTurnos = computed(() => 
  allTurnos.value.filter(turno => 
    turno.estado === AppointmentStates.Pending || turno.estado === AppointmentStates.Confirmed
  )
);

const anuladosTurnos = computed(() =>
  allTurnos.value.filter(turno => turno.estado === AppointmentStates.Canceled)
);

onMounted(() => {
  getTurnos();
});

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

    allTurnos.value = curatedData;
  })
};

</script>