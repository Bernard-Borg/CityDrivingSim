/**
 * Vue application entry point, Pinia installation and global style registration.
 * @packageDocumentation
 */

import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import { createPinia } from "pinia";

const pinia = createPinia();
createApp(App).use(pinia).mount("#app");

// Register only production builds; the development server must remain free of stale caches.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
            .catch(error => console.warn("Unable to register offline app shell:", error));
    });
}
