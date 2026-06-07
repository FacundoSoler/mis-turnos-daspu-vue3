<template>
  <div class="popup-container">
    <h2>Mis próximos Turnos de Daspu:</h2>

    <div id="listaTurnos">
      <div v-for="turno in turnos" :key="turno.id" class="turno-card">
        <div class="fecha-header">{{ formatearFecha(turno.fecha) }}</div>
        <div>{{ turno.especialidad }}</div>
        
        <div class="estado-container">
          <span :class="['estado', turno.confirmado ? 'confirmado' : '']">
            {{ turno.confirmado ? 'Confirmado' : 'Pendiente' }}
          </span>
          
          <a v-if="!turno.confirmado" :href="turno.urlAnular" class="btn-anular">
            Anular
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { onMounted } from 'vue';
// import { usePatientStore } from '../store/usePatientStore';

// const patientStore = usePatientStore();

onMounted(() => {
    // When popup opens, we hydrate the list with real DB data.

    //patientStore.cargarDatos();
});

// Aquí luego conectaremos con tu Pinia Store
const turnos = ref([
  { id: 1, fecha: '2026-06-15', especialidad: 'Odontología', confirmado: true, urlAnular: '#' },
  { id: 2, fecha: '2026-06-20', especialidad: 'Clínica Médica', confirmado: false, urlAnular: '#' }
]);

const formatearFecha = (fecha: string) => {
  // Aquí llamarás a tu función de utils/dateFormatter.ts
  return new Date(fecha).toLocaleDateString();
};


</script>