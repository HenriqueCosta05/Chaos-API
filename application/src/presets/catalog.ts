import type { PresetDefinition } from "./types.js";

/**
 * Subset of the ~85-item catalog (docs/PRD.md 6.3) shipped in this increment — the categories
 * flagged HTTP-simulável in the "Next" roadmap that don't need chaos outbound (6.4) or a
 * composed-preset design (erro humano/black swan) to be useful today. Each entry is metadata
 * layered on top of the 6 primitives (6.2) — it does not add a new `ScenarioType`.
 */
export const PRESET_CATALOG: PresetDefinition[] = [
  // Segurança
  {
    name: "auth-service-down",
    category: "seguranca",
    description: "Serviço de autenticação/autorização indisponível",
    type: "unavailable",
    options: { statusCode: 503 },
  },
  {
    name: "expired-credentials",
    category: "seguranca",
    description: "Credenciais/token expirados",
    type: "error-response",
    options: { statusCodes: [401] },
  },
  {
    name: "authz-denied",
    category: "seguranca",
    description: "Autorização negada (permissão insuficiente)",
    type: "error-response",
    options: { statusCodes: [403] },
  },
  {
    name: "secret-rotation-failure",
    category: "seguranca",
    description: "Falha na rotação de secret — serviço não consegue autenticar",
    type: "error-response",
    options: { statusCodes: [500], body: { error: "secret rotation failure" } },
  },

  // Dependências externas
  {
    name: "third-party-timeout",
    category: "dependencias-externas",
    description: "Dependência de terceiro (API externa) não responde",
    type: "connection-reset",
  },
  {
    name: "third-party-500",
    category: "dependencias-externas",
    description: "Dependência de terceiro retorna erro 5xx",
    type: "error-response",
    options: { statusCodes: [502] },
  },
  {
    name: "third-party-rate-limit",
    category: "dependencias-externas",
    description: "Dependência de terceiro aplica rate limit (429)",
    type: "error-response",
    options: { statusCodes: [429], headers: { "Retry-After": "30" } },
  },
  {
    name: "object-storage-down",
    category: "dependencias-externas",
    description: "Object storage externo (S3 e similares) indisponível",
    type: "unavailable",
    options: { statusCode: 503 },
  },
  {
    name: "idp-down",
    category: "dependencias-externas",
    description: "Identity provider externo indisponível",
    type: "unavailable",
    options: { statusCode: 503 },
  },

  // Configuração
  {
    name: "missing-env-var",
    category: "configuracao",
    description: "Variável de ambiente obrigatória faltando",
    type: "error-response",
    options: { statusCodes: [500], body: { error: "missing required environment variable" } },
  },
  {
    name: "invalid-config",
    category: "configuracao",
    description: "Configuração inválida detectada na inicialização",
    type: "error-response",
    options: { statusCodes: [500], body: { error: "invalid configuration" } },
  },
  {
    name: "wrong-endpoint",
    category: "configuracao",
    description: "Endpoint de dependência configurado errado",
    type: "unavailable",
    options: { statusCode: 503 },
  },
  {
    name: "feature-flag-misconfigured",
    category: "configuracao",
    description: "Feature flag com valor incorreto quebra o fluxo",
    type: "error-response",
    options: { statusCodes: [500], body: { error: "feature flag misconfigured" } },
  },

  // Resource Exhaustion
  {
    name: "thread-pool-exhausted",
    category: "resource-exhaustion",
    description: "Thread pool esgotado",
    type: "unavailable",
    options: { statusCode: 503, retryAfterSeconds: 5 },
  },
  {
    name: "connection-pool-exhausted",
    category: "resource-exhaustion",
    description: "Connection pool (DB/HTTP) esgotado",
    type: "unavailable",
    options: { statusCode: 503, retryAfterSeconds: 5 },
  },
  {
    name: "ephemeral-ports-exhausted",
    category: "resource-exhaustion",
    description: "Portas efêmeras esgotadas — novas conexões falham",
    type: "connection-reset",
  },
  {
    name: "disk-iops-exhausted",
    category: "resource-exhaustion",
    description: "IOPS de disco no limite — respostas fortemente lentas",
    type: "delay",
    options: { minMs: 3000, maxMs: 8000 },
  },

  // Filesystem
  {
    name: "permission-denied",
    category: "filesystem",
    description: "Permissão negada ao acessar arquivo/recurso",
    type: "error-response",
    options: { statusCodes: [403] },
  },
  {
    name: "missing-tls-cert",
    category: "filesystem",
    description: "Certificado TLS ausente no filesystem",
    type: "error-response",
    options: { statusCodes: [495], body: { error: "TLS certificate not found" } },
  },
  {
    name: "nfs-unavailable",
    category: "filesystem",
    description: "Volume NFS indisponível",
    type: "unavailable",
    options: { statusCode: 503 },
  },
  {
    name: "filesystem-corruption",
    category: "filesystem",
    description: "Corrupção de dados no filesystem — resposta corrompida",
    type: "malformed-response",
  },
];
