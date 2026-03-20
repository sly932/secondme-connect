import config from "./ai-providers.json";

type ServiceName = keyof typeof config.services;
type ProviderKey = keyof typeof config.providers;

interface ServiceConfig {
  url: string;
  model: string;
  apiKey: string;
}

/**
 * 根据服务名称解析出实际的 URL、model 和 apiKey
 */
export function getService(name: ServiceName): ServiceConfig {
  const service = config.services[name];
  const apiKey = process.env[service.apiKeyEnv];
  if (!apiKey) throw new Error(`Missing env var: ${service.apiKeyEnv}`);
  return {
    url: config.providers[service.url as ProviderKey],
    model: config.providers[service.model as ProviderKey],
    apiKey,
  };
}
