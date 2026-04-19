FROM node:18-bullseye-slim AS build
WORKDIR /app
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; else npm install --no-audit --no-fund; fi
COPY . .
ARG REACT_APP_API_URL=/api
ARG REACT_APP_WS_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_WS_URL=$REACT_APP_WS_URL
# CRA can fail builds in CI on warnings; Coolify build containers may set CI=true.
ENV CI=false
# If ESLint warnings/errors are present, don't block production builds (handled in local dev).
ENV DISABLE_ESLINT_PLUGIN=true
# Avoid OOM during webpack build on smaller servers.
ENV NODE_OPTIONS=--max-old-space-size=1536
RUN npm run build

FROM nginx:alpine
ENV PORT=80
ENV TRADEFLOW_BACKEND_ORIGIN=http://127.0.0.1:4000
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY docker-entrypoint.d/ /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/*.sh
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
