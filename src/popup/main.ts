import { createApp } from 'vue'
import { createPinia } from 'pinia'
import Popup from './Popup.vue'

const app = createApp(Popup)
app.use(createPinia())
app.mount('#app')
