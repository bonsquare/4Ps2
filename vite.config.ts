import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { getAccomplishmentSnapshot } from './src/sheets.ts'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    {
      name: 'local-google-sheets-api',
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (request.url?.split('?')[0] !== '/sheet-data') return next()
          try {
            const snapshot = await getAccomplishmentSnapshot(fetch, process.env.GOOGLE_API_KEY)
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify(snapshot))
          } catch (error) {
            response.statusCode = 502
            response.setHeader('Content-Type', 'application/json')
            response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unable to read Google Sheets' }))
          }
        })
      },
    },
  ],
})
