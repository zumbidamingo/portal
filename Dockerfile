# Stage 1 – Build Angular
FROM node:22-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps

COPY . .
# Which Angular env to bake in (production | staging). Staging deploys pass "staging"
# so the image uses the staging URLs; defaults to production for prod/manual builds.
ARG BUILD_CONFIGURATION=production
RUN npm run build -- --configuration "$BUILD_CONFIGURATION"

# Stage 2 – Serve with Nginx
FROM nginx:1.27-alpine

COPY --from=builder /app/dist/portal-suaoperacao/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
