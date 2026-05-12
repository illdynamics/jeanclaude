import http from 'node:http';
import { loadGatewayConfig } from './config.js';
import { createServer } from './server.js';
import { configureLogging } from './logging.js';

export function startGateway() {
  const config = loadGatewayConfig();
  const log = configureLogging(config.logLevel);

  const server = createServer(config);

  server.listen(config.port, config.host, () => {
    process.stderr.write(`jeanclaude-gateway listening on ${config.host}:${config.port}\n`);
  });

  const shutdown = () => {
    log.info('shutting down gateway');
    server.close(() => {
      log.info('gateway stopped');
      process.exit(0);
    });
    // Force exit after 5 seconds
    setTimeout(() => {
      log.error('forced shutdown after timeout');
      process.exit(1);
    }, 5000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { server, config };
}

// Run as CLI when executed directly
const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('/cli.js') ||
   process.argv[1].endsWith('/cli.ts') ||
   process.argv[1].endsWith('/jeanclaude-gateway'));

if (isMain) {
  startGateway();
}
