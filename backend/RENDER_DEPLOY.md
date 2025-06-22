# Render.com Deployment Configuration

This backend is configured for deployment on Render.com.

## Deployment Requirements

1. **Node.js Version**: 20 (specified in .node-version)
2. **Build Command**: `npm install`
3. **Start Command**: `npm start` (or `node server.js`)
4. **Port**: Uses `process.env.PORT` or defaults to 3001
5. **Environment**: Production

## Environment Variables

Set these in Render.com dashboard:
- `NODE_ENV=production`
- Any other custom environment variables from .env

## Socket.IO Configuration

The server is configured with:
- CORS enabled for all origins
- WebSocket and polling transports
- Proper production settings

## Health Check

The server provides health check endpoints:
- `GET /` - Basic server status
- `GET /health` - Detailed health information

