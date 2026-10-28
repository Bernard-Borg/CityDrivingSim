/**
 * Vite build configuration and source alias registration.
 * @packageDocumentation
 */

import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

/** Builds a versioned service worker from emitted app assets, excluding large public datasets. */
function pwaShell(): Plugin {
    return {
        name: "wander-pwa-shell",
        generateBundle(
            _options: unknown,
            bundle: Record<
                string,
                { fileName: string; type: string; code?: string; source?: string | Uint8Array }
            >,
        ) {
            const files = [
                "./",
                "index.html",
                "favicon.svg",
                "manifest.webmanifest",
                "icons/icon-180.png",
                "icons/icon-192.png",
                "icons/icon-512.png",
                ...Object.values(bundle)
                    .map((file) => file.fileName)
                    .filter((file) => /\.(js|css)$/.test(file)),
            ];
            const template = readFileSync(
                fileURLToPath(new URL("./src/service-worker.js", import.meta.url)),
                "utf8",
            );
            const hash = createHash("sha256").update(template);
            for (const file of Object.values(bundle)) hash.update(file.code ?? file.source ?? "");
            for (const file of [
                "favicon.svg",
                "manifest.webmanifest",
                "icons/icon-180.png",
                "icons/icon-192.png",
                "icons/icon-512.png",
            ])
                hash.update(
                    readFileSync(fileURLToPath(new URL(`./public/${file}`, import.meta.url))),
                );
            const source = template
                .replace("__BUILD_VERSION__", hash.digest("hex").slice(0, 16))
                .replace("__PRECACHE__", JSON.stringify(files));
            this.emitFile({ type: "asset", fileName: "sw.js", source });
        },
    };
}

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [vue(), tailwindcss(), pwaShell()],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
        },
    },
});
