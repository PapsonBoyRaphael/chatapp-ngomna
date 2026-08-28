/**
 * Initialisation d'OpenTelemetry pour envoyer les logs et traces vers Glintlog (OTLP HTTP port 4318)
 */
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { OTLPLogExporter } = require('@opentelemetry/exporter-logs-otlp-http');
const { SimpleLogRecordProcessor } = require('@opentelemetry/sdk-logs');

const serviceName = process.env.SERVICE_NAME || 'auth-user-service';
const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';

try {
  const sdk = new NodeSDK({
    serviceName,
    traceExporter: new OTLPTraceExporter({
      url: `${endpoint}/v1/traces`,
    }),
    logRecordProcessor: new SimpleLogRecordProcessor(
      new OTLPLogExporter({
        url: `${endpoint}/v1/logs`,
      })
    ),
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });

  sdk.start();
  console.log(`[Glintlog] 🚀 OpenTelemetry actif pour ${serviceName} -> ${endpoint}`);
} catch (err) {
  console.error('[Glintlog] ❌ Échec initialisation OpenTelemetry:', err.message);
}
