# Imej Node.js LTS yang ringan
FROM node:20-alpine

# Direktori kerja di dalam container
WORKDIR /app

# Salin manifest dahulu untuk manfaatkan lapisan cache Docker
COPY package*.json ./

# Pasang dependencies produksi sahaja
RUN npm install --omit=dev

# Salin baki kod aplikasi
COPY . .

# Port aplikasi
EXPOSE 3000

# Jalankan sebagai pengguna bukan-root (disediakan oleh imej rasmi node)
USER node

# Arahan mula lalai (boleh ditindih oleh docker-compose)
CMD ["node", "src/server.js"]
