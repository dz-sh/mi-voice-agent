# ─── Build Stage ────────────────────────────────────────────
FROM node:20-alpine AS builder

RUN npm install -g pnpm@9.15.9

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* .npmrc ./
COPY packages/mcp-server/package.json packages/mcp-server/
COPY packages/voice-gateway/package.json packages/voice-gateway/

RUN pnpm install --frozen-lockfile || pnpm install

COPY packages/ packages/
COPY turbo.json ./

RUN pnpm build
RUN pnpm --filter @mi-voice-agent/voice-gateway test

# ─── Production Stage ───────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Copy both packages
COPY --from=builder /app/packages/voice-gateway/dist ./voice-gateway/
COPY --from=builder /app/packages/voice-gateway/package.json ./voice-gateway/
COPY --from=builder /app/packages/mcp-server/dist ./mcp-server/
COPY --from=builder /app/packages/mcp-server/package.json ./mcp-server/
COPY --from=builder /app/node_modules ./node_modules/

# Environment variables (runtime injection)
ENV MI_USER="" \
    MI_PASS="" \
    MI_DID="" \
    MI_DEBUG="false" \
    MI_TIMEOUT="5000" \
    MI_HEARTBEAT="" \
    CALL_AI_KEYWORDS="" \
    OPENCLAW_URL="" \
    OPENCLAW_TOKEN="" \
    OPENCLAW_MODEL="" \
    STREAM_RESPONSE="true" \
    MCP_PORT="3001"

EXPOSE 3001

# Default: run voice gateway (the primary use case)
ENTRYPOINT ["node", "/app/voice-gateway/cli.js"]
