<template>
  <div class="popup-container">
    <h2>Mis próximos Turnos de Daspu:</h2>

    <!-- Google Login Section -->
    <div class="auth-section">
      <div v-if="!authStore.isAuthenticated" class="auth-login">
        <button 
          @click="handleLogin" 
          :disabled="authStore.isLoading"
          class="btn-google-login"
        >
          <span v-if="authStore.isLoading">Iniciando sesión...</span>
          <!-- <span v-else>🔐 Iniciar sesión con Google</span> -->
           <span v-else class="google-auth-btn">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="18px" height="18px" class="google-icon">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.5 24c0-1.65-.15-3.22-.42-4.75H24v9h12.75c-.55 2.92-2.2 5.39-4.68 7.05l7.27 5.64C43.59 36.64 46.5 30.9 46.5 24z"/>
              <path fill="#FBBC05" d="M10.54 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.98-6.19z"/>
              <path fill="#34A853" d="M24 38.5c-6.26 0-11.57-4.22-13.46-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48c6.48 0 11.93-2.13 15.89-5.81l-7.27-5.64c-2.11 1.42-4.81 2.45-8.62 2.45z"/>
            </svg>
            <span>Iniciar sesión con Google</span>
          </span>
        </button>
      </div>
      
      <div v-else class="auth-info">
        <div class="user-info">
          <img v-if="authStore.user?.picture" :src="authStore.user.picture" :alt="authStore.user.name" class="user-avatar" />
          <div class="user-details">
            <div class="user-name">{{ authStore.user?.name }}</div>
            <div class="user-email">{{ authStore.user?.email }}</div>
          </div>
        </div>
        <button 
          @click="handleLogout" 
          :disabled="authStore.isLoading"
          class="btn-logout"
        >
          {{ authStore.isLoading ? 'Cerrando...' : 'Cerrar sesión' }}
        </button>
      </div>
    </div>

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
import { useAuthStore } from '../store/useAuthStore';
import SupabaseService from '../services/SupabaseService';
import './Popup.css'

const activeTab = ref<'activos' | 'anulados'>('activos');
const allTurnos = ref<Appointment[]>([]);
const authStore = useAuthStore();
const isSyncing = ref(false);

const activosTurnos = computed(() => 
  allTurnos.value.filter(turno => 
    turno.estado === AppointmentStates.Pending || turno.estado === AppointmentStates.Confirmed
  )
);

const anuladosTurnos = computed(() =>
  allTurnos.value.filter(turno => turno.estado === AppointmentStates.Canceled)
);

onMounted(async () => {
  // Initialize Supabase
  SupabaseService.initialize();
  
  await authStore.initializeAuth();
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

/**
 * Sync all local appointments to Supabase on login
 */
const syncAllAppointmentsToSupabase = async (): Promise<void> => {
  if (!authStore.isAuthenticated) {
    console.warn('Popup: Cannot sync - user not authenticated');
    return;
  }

  isSyncing.value = true;
  try {
    console.log('Popup: Starting sync of all appointments to Supabase...');
    const syncedCount = await SupabaseService.syncAllAppointments(allTurnos.value);
    console.log(`Popup: Synced ${syncedCount} appointments to Supabase`);
  } catch (error) {
    console.error('Popup: Error syncing appointments:', error);
  } finally {
    isSyncing.value = false;
  }
};

/**
 * Sync a single appointment to Supabase
 */
const syncAppointmentToSupabase = async (appointment: Appointment): Promise<void> => {
  if (!authStore.isAuthenticated) return;

  try {
    await SupabaseService.syncAppointment(appointment);
  } catch (error) {
    console.error('Popup: Error syncing appointment to Supabase:', error);
  }
};

const handleLogin = async () => {
  const success = await authStore.login();
  if (success) {
    console.log('Login successful! User sub:', authStore.user?.sub);
    // Sync all appointments to Supabase on successful login
    await syncAllAppointmentsToSupabase();
  }
};

const handleLogout = async () => {
  await authStore.logout();
};

// Listen for storage changes (when new appointments are created or updated)
// This allows syncing when content script saves appointments
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.turnos && authStore.isAuthenticated) {
    const newTurnos = changes.turnos.newValue as Appointment[];
    const oldTurnos = changes.turnos.oldValue as Appointment[];

    // Compare and find what changed
    if (newTurnos && oldTurnos) {
      newTurnos.forEach(newTurno => {
        const oldTurno = oldTurnos.find(t => t.id === newTurno.id);
        
        if (!oldTurno) {
          // New appointment created - sync it
          console.log('Popup: New appointment detected, syncing to Supabase:', newTurno.servicio);
          syncAppointmentToSupabase(newTurno);
        } else if (JSON.stringify(oldTurno) !== JSON.stringify(newTurno)) {
          // Appointment updated - sync it
          console.log('Popup: Appointment updated, syncing to Supabase:', newTurno.servicio);
          syncAppointmentToSupabase(newTurno);
        }
      });
    }

    // Refresh local UI
    getTurnos();
  }
});

</script>
